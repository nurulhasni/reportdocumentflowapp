*"----------------------------------------------------------------------
*" Class : ZCL_SD_DOCFLOW_SUMMARY
*" Query provider (if_rap_query_provider) untuk custom entity
*" ZR_SD_DocFlowSummary -> dipakai kartu "Document Flow Summary & Analytics"
*" (6 tile Total + 10 bar Total Issues).
*"
*" KONTRAK:
*"  * SELALU mengembalikan 16 baris (SortOrder 10..160), termasuk Counter = 0.
*"  * Satu panggilan = satu pass baca data, maksimal 3 hop VBFA:
*"      VBAK (A/B/C) -> VBFA -> LIKP (J) -> VBFA -> VBRK (M/O/P) -> BKPF -> BSEG
*"  * Tidak ada BFS rekursif; semua pembacaan massal memakai FOR ALL ENTRIES.
*"
*" DEFINISI BUCKET (disetujui, lihat plan docflow-summary-issue-buckets):
*"  1  OPEN_INQUIRY         VBTYP 'A', RFSTK <> 'C', ABSTK <> 'C'
*"  2  REJECTED_INQUIRY     VBTYP 'A', ABSTK  =  'C'
*"  3  OPEN_QUOTATION       VBTYP 'B', RFSTK <> 'C', ABSTK <> 'C'
*"  4  REJECTED_QUOTATION   VBTYP 'B', ABSTK  =  'C'
*"  5  OPEN_SALES_ORDER     VBTYP 'C', GBSTK <> 'C', ABSTK <> 'C'
*"  6  REJECTED_SALES_ORDER VBTYP 'C', ABSTK  =  'C'
*"  7  UNPICKED_DELIVERY    LIKP WBSTK <> 'C' dan KOSTK = 'A'/'B'
*"  8  READY_TO_GOODS_ISSUE LIKP WBSTK <> 'C', picking selesai, LIFSK kosong,
*"                          data lengkap (UVALL = 'C' atau belum diisi)
*"  9  NO_JOURNAL_ENTRY     VBRK (M/O/P, FKSTO <> 'X', RFBSK <> 'D') tanpa BKPF
*"                          (AWTYP = 'VBRK', AWKEY = VBELN)
*"  10 NOT_YET_PAYMENT      BKPF (STBLG kosong) yang punya minimal satu baris
*"                          BSEG KOART = 'D' dengan AUGBL kosong
*"  Tile: Inquiry/Quotation/Sales Order = jumlah dokumen VBAK per VBTYP;
*"        Delivery/Billing = jumlah dokumen follow-on;
*"        Payment = dokumen FI yang SELURUH baris pelanggannya sudah clearing.
*"
*" CATATAN RELEASE-DEPENDENT (ubah di satu tempat bila sistem target beda):
*"  * VBAK-RFSTK : bila tidak terisi, otomatis fallback ke GBSTK (ref_open).
*"  * LIKP-UVALL : bila field tidak ada di release target, hapus dari SELECT
*"                 di read_deliveries dan hapus pengecekan pada count_deliveries.
*"  * BSEG mahal untuk portfolio besar. Bila terbukti lambat, ganti
*"    read_accounting_items dengan CDS item akuntansi (mis. I_OperationalAcctgDocItem);
*"    logika bucket tidak berubah. Ukur dulu, jangan optimasi buta.
*"----------------------------------------------------------------------
CLASS zcl_sd_docflow_summary DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC .

  PUBLIC SECTION.

    INTERFACES if_rap_query_provider .

  PRIVATE SECTION.

    "! Batas jumlah header VBAK yang dibaca satu panggilan. Bila tercapai,
    "! seluruh baris hasil ditandai IsTruncated = 'X'.
    CONSTANTS mc_max_docs TYPE i VALUE 50000 .
    CONSTANTS mc_actvt_display TYPE c LENGTH 2 VALUE '03' .
    CONSTANTS mc_posnr_header  TYPE c LENGTH 6 VALUE '000000' .

    CONSTANTS:
      BEGIN OF mc_summary,
        total TYPE c LENGTH 10 VALUE 'TOTAL',
        issue TYPE c LENGTH 10 VALUE 'ISSUE',
      END OF mc_summary .

    CONSTANTS:
      BEGIN OF mc_flag,
        none      TYPE c LENGTH 1 VALUE IS INITIAL,
        truncated TYPE c LENGTH 1 VALUE 'X',
        auth      TYPE c LENGTH 1 VALUE 'A',
        filter    TYPE c LENGTH 1 VALUE 'F',
      END OF mc_flag .

    CONSTANTS:
      BEGIN OF mc_status,
        complete TYPE c LENGTH 1 VALUE 'C',
        partial  TYPE c LENGTH 1 VALUE 'B',
        open     TYPE c LENGTH 1 VALUE 'A',
      END OF mc_status .

    TYPES:
      tr_vkorg TYPE RANGE OF vbak-vkorg,
      tr_vtweg TYPE RANGE OF vbak-vtweg,
      tr_spart TYPE RANGE OF vbak-spart,
      tr_kunnr TYPE RANGE OF vbak-kunnr,
      tr_bstkd TYPE RANGE OF vbkd-bstkd,
      tr_audat TYPE RANGE OF vbak-audat,
      tr_ernam TYPE RANGE OF vbak-ernam,
      tr_vbeln TYPE RANGE OF vbak-vbeln,
      "! Range untuk pencocokan di memori memakai nomor dokumen EKSTERNAL
      "! (tanpa leading zero) supaya operator wildcard *contains / starts with /
      "! ends with* berperilaku sama seperti yang dilihat user di layar.
      tr_ext   TYPE RANGE OF string,

      ty_flag   TYPE c LENGTH 1,
      ty_option TYPE c LENGTH 2,

      BEGIN OF ty_key,
        vbeln TYPE vbeln,
      END OF ty_key,
      tt_key TYPE STANDARD TABLE OF ty_key WITH DEFAULT KEY,

      BEGIN OF ty_awkey,
        awkey TYPE bkpf-awkey,
      END OF ty_awkey,
      tt_awkey     TYPE STANDARD TABLE OF ty_awkey WITH DEFAULT KEY,
      tt_awkey_srt TYPE SORTED TABLE OF ty_awkey WITH NON-UNIQUE KEY awkey,

      BEGIN OF ty_hdr,
        vbeln TYPE vbak-vbeln,
        vbtyp TYPE vbak-vbtyp,
        rfstk TYPE vbak-rfstk,
        gbstk TYPE vbak-gbstk,
        abstk TYPE vbak-abstk,
        vkorg TYPE vbak-vkorg,
        vtweg TYPE vbak-vtweg,
        spart TYPE vbak-spart,
      END OF ty_hdr,
      tt_hdr TYPE STANDARD TABLE OF ty_hdr WITH DEFAULT KEY,

      BEGIN OF ty_org,
        vkorg   TYPE vbak-vkorg,
        vtweg   TYPE vbak-vtweg,
        spart   TYPE vbak-spart,
        allowed TYPE abap_bool,
      END OF ty_org,
      tt_org TYPE SORTED TABLE OF ty_org WITH UNIQUE KEY vkorg vtweg spart,

      BEGIN OF ty_vstel,
        vstel   TYPE likp-vstel,
        allowed TYPE abap_bool,
      END OF ty_vstel,
      tt_vstel TYPE SORTED TABLE OF ty_vstel WITH UNIQUE KEY vstel,

      BEGIN OF ty_bukrs,
        bukrs   TYPE bkpf-bukrs,
        allowed TYPE abap_bool,
      END OF ty_bukrs,
      tt_bukrs TYPE SORTED TABLE OF ty_bukrs WITH UNIQUE KEY bukrs,

      BEGIN OF ty_flow,
        vbeln   TYPE vbfa-vbeln,
        vbtyp_n TYPE vbfa-vbtyp_n,
      END OF ty_flow,
      tt_flow TYPE STANDARD TABLE OF ty_flow WITH DEFAULT KEY,

      BEGIN OF ty_dlv,
        vbeln TYPE likp-vbeln,
        vstel TYPE likp-vstel,
        kostk TYPE likp-kostk,
        wbstk TYPE likp-wbstk,
        lifsk TYPE likp-lifsk,
        uvall TYPE likp-uvall,
      END OF ty_dlv,
      tt_dlv TYPE STANDARD TABLE OF ty_dlv WITH DEFAULT KEY,

      BEGIN OF ty_bil,
        vbeln TYPE vbrk-vbeln,
        vbtyp TYPE vbrk-vbtyp,
        rfbsk TYPE vbrk-rfbsk,
        fksto TYPE vbrk-fksto,
      END OF ty_bil,
      tt_bil TYPE STANDARD TABLE OF ty_bil WITH DEFAULT KEY,

      BEGIN OF ty_fi,
        bukrs TYPE bkpf-bukrs,
        belnr TYPE bkpf-belnr,
        gjahr TYPE bkpf-gjahr,
        awkey TYPE bkpf-awkey,
        stblg TYPE bkpf-stblg,
      END OF ty_fi,
      tt_fi TYPE STANDARD TABLE OF ty_fi WITH DEFAULT KEY,

      BEGIN OF ty_item,
        bukrs TYPE bseg-bukrs,
        belnr TYPE bseg-belnr,
        gjahr TYPE bseg-gjahr,
        buzei TYPE bseg-buzei,
        augbl TYPE bseg-augbl,
      END OF ty_item,
      tt_item TYPE STANDARD TABLE OF ty_item WITH DEFAULT KEY,

      BEGIN OF ty_fi_stat,
        bukrs      TYPE bkpf-bukrs,
        belnr      TYPE bkpf-belnr,
        gjahr      TYPE bkpf-gjahr,
        stblg      TYPE bkpf-stblg,
        cust_lines TYPE i,
        open_lines TYPE i,
      END OF ty_fi_stat,
      tt_fi_stat TYPE SORTED TABLE OF ty_fi_stat WITH UNIQUE KEY bukrs belnr gjahr,

      "! Satu counter per bucket. Nama komponen = BucketKey huruf kecil.
      BEGIN OF ty_count,
        open_inquiry         TYPE i,
        rejected_inquiry     TYPE i,
        open_quotation       TYPE i,
        rejected_quotation   TYPE i,
        open_sales_order     TYPE i,
        rejected_sales_order TYPE i,
        unpicked_delivery    TYPE i,
        ready_to_goods_issue TYPE i,
        no_journal_entry     TYPE i,
        not_yet_payment      TYPE i,
        total_inquiry        TYPE i,
        total_quotation      TYPE i,
        total_sales_order    TYPE i,
        total_delivery       TYPE i,
        total_billing        TYPE i,
        total_payment        TYPE i,
      END OF ty_count,

      tt_result TYPE STANDARD TABLE OF zr_sd_docflowsummary WITH DEFAULT KEY .

    " ---- Kriteria seleksi hasil konversi $filter --------------------
    DATA mr_vkorg     TYPE tr_vkorg .
    DATA mr_vtweg     TYPE tr_vtweg .
    DATA mr_spart     TYPE tr_spart .
    DATA mr_kunnr     TYPE tr_kunnr .
    DATA mr_bstkd     TYPE tr_bstkd .
    DATA mr_audat     TYPE tr_audat .
    DATA mr_ernam     TYPE tr_ernam .
    DATA mr_vbeln_db  TYPE tr_vbeln .
    DATA mr_vbeln_mem TYPE tr_ext .

    " ---- Status pemrosesan -----------------------------------------
    DATA mv_vbeln_wild  TYPE abap_bool .
    DATA mv_truncated   TYPE abap_bool .
    DATA mv_auth_missing TYPE abap_bool .
    DATA mv_flag        TYPE c LENGTH 1 .
    DATA ms_count       TYPE ty_count .

    "! Konversi $filter -> range internal. Nama filter yang tidak dikenal
    "! diabaikan; filter yang tidak bisa dijadikan range menandai flag 'F'.
    METHODS parse_filters
      IMPORTING
        !io_request TYPE REF TO if_rap_query_request .

    METHODS build_summary .

    METHODS build_result
      RETURNING
        VALUE(rt_result) TYPE tt_result .

    METHODS read_headers
      RETURNING
        VALUE(rt_hdr) TYPE tt_hdr .

    "! V_VBAK_VKO tidak bisa dicek sebelum data dibaca (butuh VKORG/VTWEG/SPART
    "! dokumen), jadi dokumen dari kombinasi organisasi yang tidak diotorisasi
    "! dibuang di sini dan hasil ditandai IsTruncated = 'A'.
    METHODS apply_header_authority
      CHANGING
        !ct_hdr TYPE tt_hdr .

    METHODS count_headers
      IMPORTING
        !it_hdr TYPE tt_hdr .

    METHODS collect_followons
      IMPORTING
        !it_hdr     TYPE tt_hdr
      EXPORTING
        !et_dlv_key TYPE tt_key
        !et_bil_key TYPE tt_key .

    METHODS read_deliveries
      IMPORTING
        !it_dlv_key   TYPE tt_key
      RETURNING
        VALUE(rt_dlv) TYPE tt_dlv .

    METHODS count_deliveries
      IMPORTING
        !it_dlv TYPE tt_dlv .

    METHODS collect_delivery_billing
      IMPORTING
        !it_dlv     TYPE tt_dlv
      CHANGING
        !ct_bil_key TYPE tt_key .

    METHODS read_billing
      IMPORTING
        !it_bil_key   TYPE tt_key
      RETURNING
        VALUE(rt_bil) TYPE tt_bil .

    METHODS read_accounting_docs
      IMPORTING
        !it_bil      TYPE tt_bil
      RETURNING
        VALUE(rt_fi) TYPE tt_fi .

    METHODS read_accounting_items
      IMPORTING
        !it_fi         TYPE tt_fi
      RETURNING
        VALUE(rt_item) TYPE tt_item .

    METHODS count_billing
      IMPORTING
        !it_bil TYPE tt_bil
        !it_fi  TYPE tt_fi .

    METHODS count_payment
      IMPORTING
        !it_fi   TYPE tt_fi
        !it_item TYPE tt_item .

    METHODS add_row
      IMPORTING
        !iv_type    TYPE clike
        !iv_key     TYPE clike
        !iv_text    TYPE clike
        !iv_counter TYPE i
        !iv_sort    TYPE i
        !iv_flag    TYPE clike
      CHANGING
        !ct_result  TYPE tt_result .

    "! Flag hasil: 'F' (filter tak didukung) > 'A' (otorisasi) > 'X' (dipotong).
    METHODS result_flag
      RETURNING
        VALUE(rv_flag) TYPE ty_flag .

    "! Inquiry/Quotation dianggap masih terbuka bila status referensi belum 'C'.
    "! RFSTK di sebagian sistem tidak terisi -> fallback ke GBSTK.
    METHODS is_reference_open
      IMPORTING
        !is_hdr      TYPE ty_hdr
      RETURNING
        VALUE(rv_yes) TYPE abap_bool .

    METHODS has_wildcard
      IMPORTING
        !iv_value     TYPE clike
      RETURNING
        VALUE(rv_yes) TYPE abap_bool .

    "! 'EQ' -> 'CP' dan 'NE' -> 'NP' bila nilainya mengandung '*'.
    METHODS wildcard_option
      IMPORTING
        !iv_option       TYPE clike
        !iv_value        TYPE clike
      RETURNING
        VALUE(rv_option) TYPE ty_option .

    METHODS alpha_in
      IMPORTING
        !iv_value       TYPE clike
      RETURNING
        VALUE(rv_value) TYPE string .

    METHODS to_external
      IMPORTING
        !iv_number    TYPE clike
      RETURNING
        VALUE(rv_ext) TYPE string .

    "! Menerima 'YYYYMMDD', 'YYYY-MM-DD' dan 'YYYY-MM-DDThh:mm:ss'.
    METHODS norm_date
      IMPORTING
        !iv_value      TYPE clike
      RETURNING
        VALUE(rv_date) TYPE dats .

ENDCLASS.



CLASS zcl_sd_docflow_summary IMPLEMENTATION.

  METHOD if_rap_query_provider~select.

    DATA: lt_result TYPE tt_result,
          lt_page   TYPE tt_result,
          lo_paging TYPE REF TO if_rap_query_paging,
          lv_top    TYPE int8,
          lv_skip   TYPE int8,
          lv_index  TYPE int8,
          lv_taken  TYPE int8,
          lv_total  TYPE int8.

    FIELD-SYMBOLS <ls_result> TYPE zr_sd_docflowsummary.

    " Reset state (instance query provider bisa dipakai ulang)
    CLEAR: mr_vkorg, mr_vtweg, mr_spart, mr_kunnr, mr_bstkd, mr_audat,
           mr_ernam, mr_vbeln_db, mr_vbeln_mem, mv_vbeln_wild,
           mv_truncated, mv_auth_missing, mv_flag, ms_count.

    TRY.
        parse_filters( io_request = io_request ).

        " Filter tidak bisa dikonversi jadi range -> jangan pernah balas angka
        " yang dihitung tanpa filter user. Semua Counter tetap 0 + flag 'F'.
        IF mv_flag <> mc_flag-filter.
          build_summary( ).
        ENDIF.

        lt_result = build_result( ).
        lv_total  = lines( lt_result ).

        IF io_request->is_total_numb_of_rec_requested( ).
          io_response->set_total_number_of_records( lv_total ).
        ENDIF.

        IF io_request->is_data_requested( ) = abap_false.
          RETURN.
        ENDIF.

        lo_paging = io_request->get_paging( ).
        IF lo_paging IS BOUND.
          lv_skip = lo_paging->get_offset( ).
          lv_top  = lo_paging->get_page_size( ).
        ENDIF.

        IF lv_skip <= 0 AND ( lv_top <= 0 OR lv_top >= lv_total ).
          io_response->set_data( lt_result ).
          RETURN.
        ENDIF.

        LOOP AT lt_result ASSIGNING <ls_result>.
          lv_index = sy-tabix.
          IF lv_index <= lv_skip.
            CONTINUE.
          ENDIF.
          APPEND <ls_result> TO lt_page.
          lv_taken = lv_taken + 1.
          IF lv_top > 0 AND lv_taken >= lv_top.
            EXIT.
          ENDIF.
        ENDLOOP.

        io_response->set_data( lt_page ).

      CATCH cx_rap_query_provider.
        " Jangan pernah dump ke UI: balas 16 bucket nol.
        CLEAR ms_count.
        mv_flag   = mc_flag-filter.
        lt_result = build_result( ).
        IF io_request->is_total_numb_of_rec_requested( ).
          io_response->set_total_number_of_records( lines( lt_result ) ).
        ENDIF.
        IF io_request->is_data_requested( ).
          io_response->set_data( lt_result ).
        ENDIF.
    ENDTRY.

  ENDMETHOD.


  METHOD parse_filters.

    DATA: lt_ranges TYPE if_rap_query_filter=>tt_name_range_pairs,
          lv_name   TYPE string,
          lv_sign   TYPE c LENGTH 1,
          lv_option TYPE c LENGTH 2,
          lv_low    TYPE string,
          lv_high   TYPE string.

    DATA ls_name_range LIKE LINE OF lt_ranges.
    DATA ls_range      LIKE LINE OF ls_name_range-range.

    IF io_request->get_filter( ) IS NOT BOUND.
      RETURN.
    ENDIF.

    TRY.
        lt_ranges = io_request->get_filter( )->get_as_ranges( ).
      CATCH cx_rap_query_filter_no_range.
        mv_flag = mc_flag-filter.
        RETURN.
    ENDTRY.

    LOOP AT lt_ranges INTO ls_name_range.

      lv_name = to_upper( ls_name_range-name ).

      LOOP AT ls_name_range-range INTO ls_range.

        lv_sign   = ls_range-sign.
        lv_option = ls_range-option.
        lv_low    = ls_range-low.
        lv_high   = ls_range-high.

        IF lv_sign IS INITIAL.
          lv_sign = 'I'.
        ENDIF.
        IF lv_option IS INITIAL.
          lv_option = 'EQ'.
        ENDIF.

        CONDENSE lv_low.
        CONDENSE lv_high.

        CASE lv_name.

          WHEN 'SALESORGANIZATION'.
            APPEND VALUE #( sign   = lv_sign
                            option = wildcard_option( iv_option = lv_option
                                                      iv_value  = lv_low )
                            low    = lv_low
                            high   = lv_high ) TO mr_vkorg.

          WHEN 'DISTRIBUTIONCHANNEL'.
            APPEND VALUE #( sign   = lv_sign
                            option = wildcard_option( iv_option = lv_option
                                                      iv_value  = lv_low )
                            low    = lv_low
                            high   = lv_high ) TO mr_vtweg.

          WHEN 'ORGANIZATIONDIVISION'.
            APPEND VALUE #( sign   = lv_sign
                            option = wildcard_option( iv_option = lv_option
                                                      iv_value  = lv_low )
                            low    = lv_low
                            high   = lv_high ) TO mr_spart.

          WHEN 'SOLDTOPARTY'.
            " KUNNR ber-conversion exit ALPHA: nilai pasti harus dipadkan
            " leading zero, nilai berwildcard dibiarkan apa adanya.
            IF has_wildcard( lv_low ) = abap_true.
              APPEND VALUE #( sign   = lv_sign
                              option = wildcard_option( iv_option = lv_option
                                                        iv_value  = lv_low )
                              low    = lv_low
                              high   = lv_high ) TO mr_kunnr.
            ELSE.
              APPEND VALUE #( sign   = lv_sign
                              option = lv_option
                              low    = alpha_in( lv_low )
                              high   = alpha_in( lv_high ) ) TO mr_kunnr.
            ENDIF.

          WHEN 'PURCHASEORDERBYCUSTOMER'.
            APPEND VALUE #( sign   = lv_sign
                            option = wildcard_option( iv_option = lv_option
                                                      iv_value  = lv_low )
                            low    = lv_low
                            high   = lv_high ) TO mr_bstkd.

          WHEN 'CREATEDBYUSER'.
            APPEND VALUE #( sign   = lv_sign
                            option = wildcard_option( iv_option = lv_option
                                                      iv_value  = lv_low )
                            low    = lv_low
                            high   = lv_high ) TO mr_ernam.

          WHEN 'SALESDOCUMENTDATE'.
            APPEND VALUE #( sign   = lv_sign
                            option = lv_option
                            low    = norm_date( lv_low )
                            high   = norm_date( lv_high ) ) TO mr_audat.

          WHEN 'SALESDOCUMENT'.
            IF has_wildcard( lv_low ) = abap_true OR has_wildcard( lv_high ) = abap_true.
              mv_vbeln_wild = abap_true.
            ENDIF.
            " Range untuk database: nilai internal (leading zero).
            APPEND VALUE #( sign   = lv_sign
                            option = lv_option
                            low    = alpha_in( lv_low )
                            high   = alpha_in( lv_high ) ) TO mr_vbeln_db.
            " Range untuk pencocokan di memori: nilai eksternal + wildcard.
            APPEND VALUE #( sign   = lv_sign
                            option = wildcard_option( iv_option = lv_option
                                                      iv_value  = lv_low )
                            low    = lv_low
                            high   = lv_high ) TO mr_vbeln_mem.

          WHEN OTHERS.
            " Filter yang tidak dikenal (mis. SummaryType/BucketKey) diabaikan:
            " query selalu mengembalikan 16 bucket lengkap.
        ENDCASE.

      ENDLOOP.
    ENDLOOP.

    " Semantik select-options: include di-OR-kan. Bila salah satu include
    " memakai wildcard, seluruh kondisi nomor dokumen HARUS dievaluasi di
    " memori (nomor eksternal), kalau tidak hasil DB akan terlalu sempit.
    IF mv_vbeln_wild = abap_true.
      CLEAR mr_vbeln_db.
    ELSE.
      CLEAR mr_vbeln_mem.
    ENDIF.

  ENDMETHOD.


  METHOD build_summary.

    DATA: lt_hdr     TYPE tt_hdr,
          lt_dlv_key TYPE tt_key,
          lt_bil_key TYPE tt_key,
          lt_dlv     TYPE tt_dlv,
          lt_bil     TYPE tt_bil,
          lt_fi      TYPE tt_fi,
          lt_item    TYPE tt_item.

    " 1. Header VBAK (Inquiry / Quotation / Sales Order) + otorisasi
    lt_hdr = read_headers( ).
    apply_header_authority( CHANGING ct_hdr = lt_hdr ).

    " 2. Bucket 1-6 + tile Inquiry/Quotation/Sales Order
    count_headers( it_hdr = lt_hdr ).

    IF lt_hdr IS INITIAL.
      RETURN.
    ENDIF.

    " 3. Follow-on dokumen sales order terpilih (VBFA hop 1)
    collect_followons( EXPORTING it_hdr     = lt_hdr
                       IMPORTING et_dlv_key = lt_dlv_key
                                 et_bil_key = lt_bil_key ).

    " 4. Bucket 7-8 + tile Delivery
    lt_dlv = read_deliveries( it_dlv_key = lt_dlv_key ).
    count_deliveries( it_dlv = lt_dlv ).

    " 5. Billing delivery-related (VBFA hop 2) digabung dengan order-related
    collect_delivery_billing( EXPORTING it_dlv     = lt_dlv
                              CHANGING  ct_bil_key = lt_bil_key ).

    " 6. Bucket 9 + tile Billing
    lt_bil = read_billing( it_bil_key = lt_bil_key ).
    lt_fi  = read_accounting_docs( it_bil = lt_bil ).
    count_billing( it_bil = lt_bil
                   it_fi  = lt_fi ).

    " 7. Bucket 10 + tile Payment
    lt_item = read_accounting_items( it_fi = lt_fi ).
    count_payment( it_fi   = lt_fi
                   it_item = lt_item ).

  ENDMETHOD.


  METHOD read_headers.

    DATA: lt_keep TYPE tt_hdr,
          ls_hdr  TYPE ty_hdr,
          lv_max  TYPE i,
          lv_ext  TYPE string.

    lv_max = mc_max_docs.

    IF mr_bstkd IS INITIAL.

      SELECT vbeln, vbtyp, rfstk, gbstk, abstk, vkorg, vtweg, spart
        FROM vbak
        WHERE vbtyp IN ( 'A', 'B', 'C' )
          AND vkorg IN @mr_vkorg
          AND vtweg IN @mr_vtweg
          AND spart IN @mr_spart
          AND kunnr IN @mr_kunnr
          AND audat IN @mr_audat
          AND ernam IN @mr_ernam
          AND vbeln IN @mr_vbeln_db
        ORDER BY vbeln
        INTO TABLE @rt_hdr
        UP TO @lv_max ROWS.

    ELSE.

      " Nomor PO pelanggan tidak ada di VBAK; datanya di VBKD baris header.
      SELECT h~vbeln, h~vbtyp, h~rfstk, h~gbstk, h~abstk,
             h~vkorg, h~vtweg, h~spart
        FROM vbak AS h
        INNER JOIN vbkd AS d ON  d~vbeln = h~vbeln
                            AND  d~posnr = '000000'
        WHERE h~vbtyp IN ( 'A', 'B', 'C' )
          AND h~vkorg IN @mr_vkorg
          AND h~vtweg IN @mr_vtweg
          AND h~spart IN @mr_spart
          AND h~kunnr IN @mr_kunnr
          AND h~audat IN @mr_audat
          AND h~ernam IN @mr_ernam
          AND h~vbeln IN @mr_vbeln_db
          AND d~bstkd IN @mr_bstkd
        ORDER BY h~vbeln
        INTO TABLE @rt_hdr
        UP TO @lv_max ROWS.

    ENDIF.

    IF lines( rt_hdr ) >= lv_max.
      mv_truncated = abap_true.
    ENDIF.

    " Kondisi wildcard pada nomor dokumen dievaluasi terhadap nomor
    " eksternal (tanpa leading zero) supaya "starts with" tetap benar.
    IF mv_vbeln_wild = abap_true AND mr_vbeln_mem IS NOT INITIAL.
      LOOP AT rt_hdr INTO ls_hdr.
        lv_ext = to_external( ls_hdr-vbeln ).
        IF lv_ext IN mr_vbeln_mem.
          APPEND ls_hdr TO lt_keep.
        ENDIF.
      ENDLOOP.
      rt_hdr = lt_keep.
    ENDIF.

  ENDMETHOD.


  METHOD apply_header_authority.

    DATA: lt_org  TYPE tt_org,
          ls_org  TYPE ty_org,
          lt_keep TYPE tt_hdr,
          ls_hdr  TYPE ty_hdr.

    IF ct_hdr IS INITIAL.
      RETURN.
    ENDIF.

    LOOP AT ct_hdr INTO ls_hdr.
      CLEAR ls_org.
      ls_org-vkorg = ls_hdr-vkorg.
      ls_org-vtweg = ls_hdr-vtweg.
      ls_org-spart = ls_hdr-spart.
      INSERT ls_org INTO TABLE lt_org.
    ENDLOOP.

    LOOP AT lt_org INTO ls_org.
      AUTHORITY-CHECK OBJECT 'V_VBAK_VKO'
        ID 'VKORG' FIELD ls_org-vkorg
        ID 'VTWEG' FIELD ls_org-vtweg
        ID 'SPART' FIELD ls_org-spart
        ID 'ACTVT' FIELD mc_actvt_display.
      IF sy-subrc = 0.
        ls_org-allowed = abap_true.
      ELSE.
        ls_org-allowed  = abap_false.
        mv_auth_missing = abap_true.
      ENDIF.
      MODIFY TABLE lt_org FROM ls_org.
    ENDLOOP.

    IF mv_auth_missing = abap_false.
      RETURN.
    ENDIF.

    LOOP AT ct_hdr INTO ls_hdr.
      READ TABLE lt_org INTO ls_org
           WITH TABLE KEY vkorg = ls_hdr-vkorg
                          vtweg = ls_hdr-vtweg
                          spart = ls_hdr-spart.
      IF sy-subrc = 0 AND ls_org-allowed = abap_true.
        APPEND ls_hdr TO lt_keep.
      ENDIF.
    ENDLOOP.

    ct_hdr = lt_keep.

  ENDMETHOD.


  METHOD count_headers.

    DATA: ls_hdr      TYPE ty_hdr,
          lv_rejected TYPE abap_bool.

    LOOP AT it_hdr INTO ls_hdr.

      lv_rejected = xsdbool( ls_hdr-abstk = mc_status-complete ).

      CASE ls_hdr-vbtyp.

        WHEN 'A'.
          ms_count-total_inquiry = ms_count-total_inquiry + 1.
          IF lv_rejected = abap_true.
            ms_count-rejected_inquiry = ms_count-rejected_inquiry + 1.
          ELSEIF is_reference_open( is_hdr = ls_hdr ) = abap_true.
            ms_count-open_inquiry = ms_count-open_inquiry + 1.
          ENDIF.

        WHEN 'B'.
          ms_count-total_quotation = ms_count-total_quotation + 1.
          IF lv_rejected = abap_true.
            ms_count-rejected_quotation = ms_count-rejected_quotation + 1.
          ELSEIF is_reference_open( is_hdr = ls_hdr ) = abap_true.
            ms_count-open_quotation = ms_count-open_quotation + 1.
          ENDIF.

        WHEN 'C'.
          ms_count-total_sales_order = ms_count-total_sales_order + 1.
          IF lv_rejected = abap_true.
            ms_count-rejected_sales_order = ms_count-rejected_sales_order + 1.
          ELSEIF ls_hdr-gbstk <> mc_status-complete.
            ms_count-open_sales_order = ms_count-open_sales_order + 1.
          ENDIF.

      ENDCASE.

    ENDLOOP.

  ENDMETHOD.


  METHOD collect_followons.

    DATA: lt_ord  TYPE tt_key,
          lt_flow TYPE tt_flow,
          ls_flow TYPE ty_flow,
          ls_hdr  TYPE ty_hdr.

    CLEAR: et_dlv_key, et_bil_key.

    LOOP AT it_hdr INTO ls_hdr WHERE vbtyp = 'C'.
      APPEND VALUE #( vbeln = ls_hdr-vbeln ) TO lt_ord.
    ENDLOOP.

    IF lt_ord IS INITIAL.
      RETURN.
    ENDIF.

    SORT lt_ord BY vbeln.
    DELETE ADJACENT DUPLICATES FROM lt_ord COMPARING vbeln.

    " J = outbound delivery, M/O/P = invoice / credit memo / debit memo
    SELECT vbeln, vbtyp_n
      FROM vbfa
      FOR ALL ENTRIES IN @lt_ord
      WHERE vbelv   = @lt_ord-vbeln
        AND vbtyp_n IN ( 'J', 'M', 'O', 'P' )
      INTO TABLE @lt_flow.

    LOOP AT lt_flow INTO ls_flow.
      IF ls_flow-vbeln IS INITIAL.
        CONTINUE.
      ENDIF.
      IF ls_flow-vbtyp_n = 'J'.
        APPEND VALUE #( vbeln = ls_flow-vbeln ) TO et_dlv_key.
      ELSE.
        APPEND VALUE #( vbeln = ls_flow-vbeln ) TO et_bil_key.
      ENDIF.
    ENDLOOP.

    SORT et_dlv_key BY vbeln.
    DELETE ADJACENT DUPLICATES FROM et_dlv_key COMPARING vbeln.
    SORT et_bil_key BY vbeln.
    DELETE ADJACENT DUPLICATES FROM et_bil_key COMPARING vbeln.

  ENDMETHOD.


  METHOD read_deliveries.

    DATA: lt_vstel TYPE tt_vstel,
          ls_vstel TYPE ty_vstel,
          lt_keep  TYPE tt_dlv,
          ls_dlv   TYPE ty_dlv,
          lv_drop  TYPE abap_bool.

    IF it_dlv_key IS INITIAL.
      RETURN.
    ENDIF.

    " Catatan release: bila LIKP-UVALL tidak tersedia di sistem target,
    " hapus field ini dari SELECT dan dari count_deliveries.
    SELECT vbeln, vstel, kostk, wbstk, lifsk, uvall
      FROM likp
      FOR ALL ENTRIES IN @it_dlv_key
      WHERE vbeln = @it_dlv_key-vbeln
      INTO TABLE @rt_dlv.

    IF rt_dlv IS INITIAL.
      RETURN.
    ENDIF.

    " V_LIKP_VST butuh VSTEL, jadi otorisasi hanya bisa dicek setelah baca.
    LOOP AT rt_dlv INTO ls_dlv.
      CLEAR ls_vstel.
      ls_vstel-vstel = ls_dlv-vstel.
      INSERT ls_vstel INTO TABLE lt_vstel.
    ENDLOOP.

    LOOP AT lt_vstel INTO ls_vstel.
      AUTHORITY-CHECK OBJECT 'V_LIKP_VST'
        ID 'VSTEL' FIELD ls_vstel-vstel
        ID 'ACTVT' FIELD mc_actvt_display.
      IF sy-subrc = 0.
        ls_vstel-allowed = abap_true.
      ELSE.
        ls_vstel-allowed = abap_false.
        mv_auth_missing  = abap_true.
        lv_drop          = abap_true.
      ENDIF.
      MODIFY TABLE lt_vstel FROM ls_vstel.
    ENDLOOP.

    IF lv_drop = abap_false.
      RETURN.
    ENDIF.

    LOOP AT rt_dlv INTO ls_dlv.
      READ TABLE lt_vstel INTO ls_vstel WITH TABLE KEY vstel = ls_dlv-vstel.
      IF sy-subrc = 0 AND ls_vstel-allowed = abap_true.
        APPEND ls_dlv TO lt_keep.
      ENDIF.
    ENDLOOP.

    rt_dlv = lt_keep.

  ENDMETHOD.


  METHOD count_deliveries.

    DATA ls_dlv TYPE ty_dlv.

    LOOP AT it_dlv INTO ls_dlv.

      " Tile Delivery = seluruh delivery follow-on
      ms_count-total_delivery = ms_count-total_delivery + 1.

      " Cakupan issue: barang belum keluar gudang (WBSTK <> 'C')
      IF ls_dlv-wbstk = mc_status-complete.
        CONTINUE.
      ENDIF.

      " Picking belum selesai. KOSTK kosong = tidak relevan picking
      " (sejalan dengan VL06P yang hanya menampilkan status 'A'/'B'),
      " jadi TIDAK dihitung sebagai unpicked.
      IF ls_dlv-kostk = mc_status-open OR ls_dlv-kostk = mc_status-partial.
        ms_count-unpicked_delivery = ms_count-unpicked_delivery + 1.
        CONTINUE.
      ENDIF.

      " Siap Post Goods Issue: picking beres, tidak diblokir, data lengkap.
      " UVALL kosong diperlakukan lengkap (field tidak selalu diisi).
      IF ls_dlv-lifsk IS INITIAL
         AND ( ls_dlv-uvall = mc_status-complete OR ls_dlv-uvall IS INITIAL ).
        ms_count-ready_to_goods_issue = ms_count-ready_to_goods_issue + 1.
      ENDIF.

    ENDLOOP.

  ENDMETHOD.


  METHOD collect_delivery_billing.

    DATA: lt_key  TYPE tt_key,
          lt_flow TYPE tt_flow,
          ls_flow TYPE ty_flow,
          ls_dlv  TYPE ty_dlv.

    IF it_dlv IS INITIAL.
      RETURN.
    ENDIF.

    LOOP AT it_dlv INTO ls_dlv.
      APPEND VALUE #( vbeln = ls_dlv-vbeln ) TO lt_key.
    ENDLOOP.

    SORT lt_key BY vbeln.
    DELETE ADJACENT DUPLICATES FROM lt_key COMPARING vbeln.

    SELECT vbeln, vbtyp_n
      FROM vbfa
      FOR ALL ENTRIES IN @lt_key
      WHERE vbelv   = @lt_key-vbeln
        AND vbtyp_n IN ( 'M', 'O', 'P' )
      INTO TABLE @lt_flow.

    LOOP AT lt_flow INTO ls_flow.
      IF ls_flow-vbeln IS INITIAL.
        CONTINUE.
      ENDIF.
      APPEND VALUE #( vbeln = ls_flow-vbeln ) TO ct_bil_key.
    ENDLOOP.

    SORT ct_bil_key BY vbeln.
    DELETE ADJACENT DUPLICATES FROM ct_bil_key COMPARING vbeln.

  ENDMETHOD.


  METHOD read_billing.

    IF it_bil_key IS INITIAL.
      RETURN.
    ENDIF.

    SELECT vbeln, vbtyp, rfbsk, fksto
      FROM vbrk
      FOR ALL ENTRIES IN @it_bil_key
      WHERE vbeln = @it_bil_key-vbeln
      INTO TABLE @rt_bil.

  ENDMETHOD.


  METHOD read_accounting_docs.

    DATA: lt_awkey TYPE tt_awkey,
          ls_awkey TYPE ty_awkey,
          ls_bil   TYPE ty_bil,
          lt_bukrs TYPE tt_bukrs,
          ls_bukrs TYPE ty_bukrs,
          lt_keep  TYPE tt_fi,
          ls_fi    TYPE ty_fi,
          lv_drop  TYPE abap_bool.

    IF it_bil IS INITIAL.
      RETURN.
    ENDIF.

    LOOP AT it_bil INTO ls_bil.
      IF ls_bil-fksto = 'X'.
        CONTINUE.
      ENDIF.
      CLEAR ls_awkey.
      ls_awkey-awkey = ls_bil-vbeln.
      APPEND ls_awkey TO lt_awkey.
    ENDLOOP.

    IF lt_awkey IS INITIAL.
      RETURN.
    ENDIF.

    SORT lt_awkey BY awkey.
    DELETE ADJACENT DUPLICATES FROM lt_awkey COMPARING awkey.

    SELECT bukrs, belnr, gjahr, awkey, stblg
      FROM bkpf
      FOR ALL ENTRIES IN @lt_awkey
      WHERE awtyp = 'VBRK'
        AND awkey = @lt_awkey-awkey
      INTO TABLE @rt_fi.

    IF rt_fi IS INITIAL.
      RETURN.
    ENDIF.

    " F_BKPF_BUK hanya bisa dicek setelah company code diketahui.
    LOOP AT rt_fi INTO ls_fi.
      CLEAR ls_bukrs.
      ls_bukrs-bukrs = ls_fi-bukrs.
      INSERT ls_bukrs INTO TABLE lt_bukrs.
    ENDLOOP.

    LOOP AT lt_bukrs INTO ls_bukrs.
      AUTHORITY-CHECK OBJECT 'F_BKPF_BUK'
        ID 'BUKRS' FIELD ls_bukrs-bukrs
        ID 'ACTVT' FIELD mc_actvt_display.
      IF sy-subrc = 0.
        ls_bukrs-allowed = abap_true.
      ELSE.
        ls_bukrs-allowed = abap_false.
        mv_auth_missing  = abap_true.
        lv_drop          = abap_true.
      ENDIF.
      MODIFY TABLE lt_bukrs FROM ls_bukrs.
    ENDLOOP.

    IF lv_drop = abap_false.
      RETURN.
    ENDIF.

    LOOP AT rt_fi INTO ls_fi.
      READ TABLE lt_bukrs INTO ls_bukrs WITH TABLE KEY bukrs = ls_fi-bukrs.
      IF sy-subrc = 0 AND ls_bukrs-allowed = abap_true.
        APPEND ls_fi TO lt_keep.
      ENDIF.
    ENDLOOP.

    rt_fi = lt_keep.

  ENDMETHOD.


  METHOD read_accounting_items.

    IF it_fi IS INITIAL.
      RETURN.
    ENDIF.

    " KOART 'D' = baris pelanggan (piutang). Lihat catatan performa di header
    " kelas bila BSEG terbukti lambat pada sistem target.
    SELECT bukrs, belnr, gjahr, buzei, augbl
      FROM bseg
      FOR ALL ENTRIES IN @it_fi
      WHERE bukrs = @it_fi-bukrs
        AND belnr = @it_fi-belnr
        AND gjahr = @it_fi-gjahr
        AND koart = 'D'
      INTO TABLE @rt_item.

  ENDMETHOD.


  METHOD count_billing.

    DATA: ls_bil    TYPE ty_bil,
          ls_fi     TYPE ty_fi,
          lt_je_key TYPE tt_awkey_srt,
          ls_awkey  TYPE ty_awkey.

    LOOP AT it_fi INTO ls_fi.
      CLEAR ls_awkey.
      ls_awkey-awkey = ls_fi-awkey.
      INSERT ls_awkey INTO TABLE lt_je_key.
    ENDLOOP.

    LOOP AT it_bil INTO ls_bil.

      " Dokumen faktur yang dibatalkan tidak masuk hitungan apa pun.
      IF ls_bil-fksto = 'X'.
        CONTINUE.
      ENDIF.

      ms_count-total_billing = ms_count-total_billing + 1.

      " Hanya faktur/memo yang relevan akuntansi ('D' = tidak relevan).
      IF ls_bil-vbtyp <> 'M' AND ls_bil-vbtyp <> 'O' AND ls_bil-vbtyp <> 'P'.
        CONTINUE.
      ENDIF.
      IF ls_bil-rfbsk = 'D'.
        CONTINUE.
      ENDIF.

      IF NOT line_exists( lt_je_key[ awkey = ls_bil-vbeln ] ).
        ms_count-no_journal_entry = ms_count-no_journal_entry + 1.
      ENDIF.

    ENDLOOP.

  ENDMETHOD.


  METHOD count_payment.

    DATA: lt_stat TYPE tt_fi_stat,
          ls_stat TYPE ty_fi_stat,
          ls_fi   TYPE ty_fi,
          ls_item TYPE ty_item.

    FIELD-SYMBOLS <ls_stat> TYPE ty_fi_stat.

    LOOP AT it_fi INTO ls_fi.
      CLEAR ls_stat.
      ls_stat-bukrs = ls_fi-bukrs.
      ls_stat-belnr = ls_fi-belnr.
      ls_stat-gjahr = ls_fi-gjahr.
      ls_stat-stblg = ls_fi-stblg.
      INSERT ls_stat INTO TABLE lt_stat.
    ENDLOOP.

    LOOP AT it_item INTO ls_item.
      READ TABLE lt_stat ASSIGNING <ls_stat>
           WITH TABLE KEY bukrs = ls_item-bukrs
                          belnr = ls_item-belnr
                          gjahr = ls_item-gjahr.
      IF sy-subrc <> 0.
        CONTINUE.
      ENDIF.
      <ls_stat>-cust_lines = <ls_stat>-cust_lines + 1.
      IF ls_item-augbl IS INITIAL.
        <ls_stat>-open_lines = <ls_stat>-open_lines + 1.
      ENDIF.
    ENDLOOP.

    LOOP AT lt_stat INTO ls_stat.

      " Dokumen yang sudah dibatalkan (reversal) tidak dihitung.
      IF ls_stat-stblg IS NOT INITIAL.
        CONTINUE.
      ENDIF.
      " Tanpa baris pelanggan tidak ada yang bisa dilunasi.
      IF ls_stat-cust_lines = 0.
        CONTINUE.
      ENDIF.

      IF ls_stat-open_lines > 0.
        ms_count-not_yet_payment = ms_count-not_yet_payment + 1.
      ELSE.
        ms_count-total_payment = ms_count-total_payment + 1.
      ENDIF.

    ENDLOOP.

  ENDMETHOD.


  METHOD build_result.

    DATA lv_flag TYPE c LENGTH 1.

    lv_flag = result_flag( ).

    " --- 10 bucket issue (urutan = urutan kriteria bisnis) ------------
    add_row( EXPORTING iv_type    = mc_summary-issue
                       iv_key     = 'OPEN_INQUIRY'
                       iv_text    = 'Open Inquiry Document'
                       iv_counter = ms_count-open_inquiry
                       iv_sort    = 10
                       iv_flag    = lv_flag
             CHANGING  ct_result  = rt_result ).

    add_row( EXPORTING iv_type    = mc_summary-issue
                       iv_key     = 'REJECTED_INQUIRY'
                       iv_text    = 'Rejected Inquiry'
                       iv_counter = ms_count-rejected_inquiry
                       iv_sort    = 20
                       iv_flag    = lv_flag
             CHANGING  ct_result  = rt_result ).

    add_row( EXPORTING iv_type    = mc_summary-issue
                       iv_key     = 'OPEN_QUOTATION'
                       iv_text    = 'Open Quotation Document'
                       iv_counter = ms_count-open_quotation
                       iv_sort    = 30
                       iv_flag    = lv_flag
             CHANGING  ct_result  = rt_result ).

    add_row( EXPORTING iv_type    = mc_summary-issue
                       iv_key     = 'REJECTED_QUOTATION'
                       iv_text    = 'Rejected Quotation'
                       iv_counter = ms_count-rejected_quotation
                       iv_sort    = 40
                       iv_flag    = lv_flag
             CHANGING  ct_result  = rt_result ).

    add_row( EXPORTING iv_type    = mc_summary-issue
                       iv_key     = 'OPEN_SALES_ORDER'
                       iv_text    = 'Open Sales Order'
                       iv_counter = ms_count-open_sales_order
                       iv_sort    = 50
                       iv_flag    = lv_flag
             CHANGING  ct_result  = rt_result ).

    add_row( EXPORTING iv_type    = mc_summary-issue
                       iv_key     = 'REJECTED_SALES_ORDER'
                       iv_text    = 'Rejected Sales Order'
                       iv_counter = ms_count-rejected_sales_order
                       iv_sort    = 60
                       iv_flag    = lv_flag
             CHANGING  ct_result  = rt_result ).

    add_row( EXPORTING iv_type    = mc_summary-issue
                       iv_key     = 'UNPICKED_DELIVERY'
                       iv_text    = 'Unpicked Delivery'
                       iv_counter = ms_count-unpicked_delivery
                       iv_sort    = 70
                       iv_flag    = lv_flag
             CHANGING  ct_result  = rt_result ).

    add_row( EXPORTING iv_type    = mc_summary-issue
                       iv_key     = 'READY_TO_GOODS_ISSUE'
                       iv_text    = 'Ready to Goods Issue'
                       iv_counter = ms_count-ready_to_goods_issue
                       iv_sort    = 80
                       iv_flag    = lv_flag
             CHANGING  ct_result  = rt_result ).

    add_row( EXPORTING iv_type    = mc_summary-issue
                       iv_key     = 'NO_JOURNAL_ENTRY'
                       iv_text    = 'No Journal Entry Created'
                       iv_counter = ms_count-no_journal_entry
                       iv_sort    = 90
                       iv_flag    = lv_flag
             CHANGING  ct_result  = rt_result ).

    add_row( EXPORTING iv_type    = mc_summary-issue
                       iv_key     = 'NOT_YET_PAYMENT'
                       iv_text    = 'Not Yet Payment'
                       iv_counter = ms_count-not_yet_payment
                       iv_sort    = 100
                       iv_flag    = lv_flag
             CHANGING  ct_result  = rt_result ).

    " --- 6 tile total ------------------------------------------------
    add_row( EXPORTING iv_type    = mc_summary-total
                       iv_key     = 'TOTAL_INQUIRY'
                       iv_text    = 'Inquiry'
                       iv_counter = ms_count-total_inquiry
                       iv_sort    = 110
                       iv_flag    = lv_flag
             CHANGING  ct_result  = rt_result ).

    add_row( EXPORTING iv_type    = mc_summary-total
                       iv_key     = 'TOTAL_QUOTATION'
                       iv_text    = 'Quotation'
                       iv_counter = ms_count-total_quotation
                       iv_sort    = 120
                       iv_flag    = lv_flag
             CHANGING  ct_result  = rt_result ).

    add_row( EXPORTING iv_type    = mc_summary-total
                       iv_key     = 'TOTAL_SALES_ORDER'
                       iv_text    = 'Sales Order'
                       iv_counter = ms_count-total_sales_order
                       iv_sort    = 130
                       iv_flag    = lv_flag
             CHANGING  ct_result  = rt_result ).

    add_row( EXPORTING iv_type    = mc_summary-total
                       iv_key     = 'TOTAL_DELIVERY'
                       iv_text    = 'Delivery'
                       iv_counter = ms_count-total_delivery
                       iv_sort    = 140
                       iv_flag    = lv_flag
             CHANGING  ct_result  = rt_result ).

    add_row( EXPORTING iv_type    = mc_summary-total
                       iv_key     = 'TOTAL_BILLING'
                       iv_text    = 'Billing'
                       iv_counter = ms_count-total_billing
                       iv_sort    = 150
                       iv_flag    = lv_flag
             CHANGING  ct_result  = rt_result ).

    add_row( EXPORTING iv_type    = mc_summary-total
                       iv_key     = 'TOTAL_PAYMENT'
                       iv_text    = 'Payment'
                       iv_counter = ms_count-total_payment
                       iv_sort    = 160
                       iv_flag    = lv_flag
             CHANGING  ct_result  = rt_result ).

  ENDMETHOD.


  METHOD add_row.

    DATA ls_row TYPE zr_sd_docflowsummary.

    ls_row-summarytype = iv_type.
    ls_row-bucketkey   = iv_key.
    ls_row-buckettext  = iv_text.
    ls_row-counter     = iv_counter.
    ls_row-sortorder   = iv_sort.
    ls_row-istruncated = iv_flag.

    APPEND ls_row TO ct_result.

  ENDMETHOD.


  METHOD result_flag.

    IF mv_flag = mc_flag-filter.
      rv_flag = mc_flag-filter.
    ELSEIF mv_auth_missing = abap_true.
      rv_flag = mc_flag-auth.
    ELSEIF mv_truncated = abap_true.
      rv_flag = mc_flag-truncated.
    ELSE.
      rv_flag = mc_flag-none.
    ENDIF.

  ENDMETHOD.


  METHOD is_reference_open.

    DATA lv_status TYPE c LENGTH 1.

    lv_status = is_hdr-rfstk.
    IF lv_status IS INITIAL.
      " RFSTK tidak terisi di sebagian sistem -> pakai status keseluruhan.
      lv_status = is_hdr-gbstk.
    ENDIF.

    rv_yes = xsdbool( lv_status <> mc_status-complete ).

  ENDMETHOD.


  METHOD has_wildcard.

    rv_yes = xsdbool( iv_value CA '*' ).

  ENDMETHOD.


  METHOD wildcard_option.

    rv_option = iv_option.

    IF iv_value NA '*'.
      RETURN.
    ENDIF.

    CASE iv_option.
      WHEN 'EQ'.
        rv_option = 'CP'.
      WHEN 'NE'.
        rv_option = 'NP'.
    ENDCASE.

  ENDMETHOD.


  METHOD alpha_in.

    DATA lv_in TYPE string.

    lv_in = iv_value.
    CONDENSE lv_in.

    IF lv_in IS INITIAL.
      RETURN.
    ENDIF.

    rv_value = |{ lv_in ALPHA = IN }|.

  ENDMETHOD.


  METHOD to_external.

    rv_ext = |{ iv_number ALPHA = OUT }|.
    CONDENSE rv_ext.

  ENDMETHOD.


  METHOD norm_date.

    DATA lv_raw TYPE string.

    lv_raw = iv_value.
    CONDENSE lv_raw.
    REPLACE ALL OCCURRENCES OF '-' IN lv_raw WITH ''.

    IF strlen( lv_raw ) >= 8.
      rv_date = lv_raw(8).
    ENDIF.

  ENDMETHOD.

ENDCLASS.
