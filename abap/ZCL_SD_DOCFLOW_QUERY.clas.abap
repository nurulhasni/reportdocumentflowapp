CLASS zcl_sd_docflow_query DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC .

  PUBLIC SECTION.

    INTERFACES if_rap_query_provider .

  PRIVATE SECTION.

    CONSTANTS:
      BEGIN OF mc_state,
        positive         TYPE string VALUE 'Positive',
        critical         TYPE string VALUE 'Critical',
        negative         TYPE string VALUE 'Negative',
        neutral          TYPE string VALUE 'Neutral',
        planned          TYPE string VALUE 'Planned',
        planned_negative TYPE string VALUE 'PlannedNegative',
      END OF mc_state .

    "! Urutan lane = urutan kolom pada diagram F2577:
    "! Order -> Delivery -> Invoicing -> Accounting -> Customer Return Processing.
    "! Lane retur berada PALING KANAN (setelah Accounting) persis seperti standar.
    CONSTANTS:
      BEGIN OF mc_lane,
        inquiry         TYPE i VALUE 1,
        quotation       TYPE i VALUE 2,
        order           TYPE i VALUE 3,
        delivery        TYPE i VALUE 4,
        invoicing       TYPE i VALUE 5,
        accounting      TYPE i VALUE 6,
        customer_return TYPE i VALUE 7,
      END OF mc_lane .

    CONSTANTS:
      BEGIN OF mc_lane_key,
        inquiry         TYPE string VALUE 'lane_inquiry',
        quotation       TYPE string VALUE 'lane_quotation',
        order           TYPE string VALUE 'lane_order',
        delivery        TYPE string VALUE 'lane_delivery',
        invoicing       TYPE string VALUE 'lane_invoicing',
        accounting      TYPE string VALUE 'lane_accounting',
        customer_return TYPE string VALUE 'lane_customer_return',
      END OF mc_lane_key .

    CONSTANTS mc_max_nodes     TYPE i     VALUE 200 .
    CONSTANTS mc_max_level     TYPE i     VALUE 8   .
    CONSTANTS mc_planned_je    TYPE c LENGTH 1 VALUE 'X' .
    CONSTANTS mc_je_category   TYPE c LENGTH 1 VALUE 'g' .
    CONSTANTS mc_node_prefix   TYPE string VALUE 'node_' .

    TYPES:
      BEGIN OF ty_key,
        vbeln TYPE vbeln,
      END OF ty_key,
      tt_key TYPE STANDARD TABLE OF ty_key WITH EMPTY KEY,

      BEGIN OF ty_awkey,
        awkey TYPE awkey,
      END OF ty_awkey,
      tt_awkey TYPE STANDARD TABLE OF ty_awkey WITH EMPTY KEY,

      BEGIN OF ty_doc,
        node  TYPE string,
        vbeln TYPE vbeln,
        vbtyp TYPE vbtyp,
        lane  TYPE i,
      END OF ty_doc,
      tt_doc      TYPE SORTED TABLE OF ty_doc WITH UNIQUE KEY node,
      tt_doc_sort TYPE STANDARD TABLE OF ty_doc WITH EMPTY KEY,

      BEGIN OF ty_raw_edge,
        vbelv TYPE vbeln,
        vbeln TYPE vbeln,
      END OF ty_raw_edge,
      tt_raw_edge TYPE SORTED TABLE OF ty_raw_edge WITH UNIQUE KEY vbelv vbeln,

      BEGIN OF ty_link,
        parent TYPE string,
        child  TYPE string,
      END OF ty_link,
      tt_link TYPE SORTED TABLE OF ty_link WITH UNIQUE KEY parent child,

      BEGIN OF ty_vbfa,
        vbelv   TYPE vbeln,
        vbeln   TYPE vbeln,
        vbtyp_v TYPE vbtyp_v,
        vbtyp_n TYPE vbtyp_n,
      END OF ty_vbfa,
      tt_vbfa TYPE STANDARD TABLE OF ty_vbfa WITH EMPTY KEY,

      BEGIN OF ty_vbak,
        vbeln TYPE vbak-vbeln,
        erdat TYPE vbak-erdat,
        ernam TYPE vbak-ernam,
        audat TYPE vbak-audat,
        vdatu TYPE dats,
        bnddt TYPE dats,
        vbtyp TYPE vbak-vbtyp,
        netwr TYPE vbak-netwr,
        waerk TYPE vbak-waerk,
        lifsk TYPE vbak-lifsk,
        faksk TYPE vbak-faksk,
        abstk TYPE vbak-abstk,
        lfstk TYPE vbak-lfstk,
        fksak TYPE vbak-fksak,
        gbstk TYPE vbak-gbstk,
      END OF ty_vbak,
      tt_vbak TYPE SORTED TABLE OF ty_vbak WITH UNIQUE KEY vbeln,

      BEGIN OF ty_vbap,
        vbeln TYPE vbap-vbeln,
        posnr TYPE vbap-posnr,
        faksp TYPE vbap-faksp,
      END OF ty_vbap,
      tt_vbap TYPE SORTED TABLE OF ty_vbap WITH NON-UNIQUE KEY vbeln,

      BEGIN OF ty_likp,
        vbeln     TYPE likp-vbeln,
        erdat     TYPE likp-erdat,
        ernam     TYPE likp-ernam,
        vbtyp     TYPE likp-vbtyp,
        lfdat     TYPE dats,
        wadat     TYPE dats,
        wadat_ist TYPE dats,
        lifsk     TYPE likp-lifsk,
        faksk     TYPE likp-faksk,
        wbstk     TYPE likp-wbstk,
        kostk     TYPE likp-kostk,
        trsta     TYPE likp-trsta,
        kunnr     TYPE likp-kunnr,
      END OF ty_likp,
      tt_likp TYPE SORTED TABLE OF ty_likp WITH UNIQUE KEY vbeln,

      BEGIN OF ty_vbrk,
        vbeln TYPE vbrk-vbeln,
        erdat TYPE vbrk-erdat,
        ernam TYPE vbrk-ernam,
        fkdat TYPE dats,
        vbtyp TYPE vbrk-vbtyp,
        fkart TYPE vbrk-fkart,
        netwr TYPE vbrk-netwr,
        waerk TYPE vbrk-waerk,
        rfbsk TYPE vbrk-rfbsk,
        fksto TYPE vbrk-fksto,
        sfakn TYPE vbrk-sfakn,
        kunag TYPE vbrk-kunag,
      END OF ty_vbrk,
      tt_vbrk TYPE SORTED TABLE OF ty_vbrk WITH UNIQUE KEY vbeln,

      BEGIN OF ty_bkpf,
        bukrs TYPE bkpf-bukrs,
        belnr TYPE bkpf-belnr,
        gjahr TYPE bkpf-gjahr,
        blart TYPE bkpf-blart,
        budat TYPE dats,
        bldat TYPE dats,
        usnam TYPE bkpf-usnam,
        waers TYPE bkpf-waers,
        stblg TYPE bkpf-stblg,
        awkey TYPE bkpf-awkey,
      END OF ty_bkpf,
      tt_bkpf TYPE SORTED TABLE OF ty_bkpf WITH UNIQUE KEY belnr gjahr bukrs,

      BEGIN OF ty_bseg,
        bukrs TYPE bseg-bukrs,
        belnr TYPE bseg-belnr,
        gjahr TYPE bseg-gjahr,
        buzei TYPE bseg-buzei,
        augbl TYPE bseg-augbl,
        augdt TYPE dats,
      END OF ty_bseg,
      tt_bseg TYPE STANDARD TABLE OF ty_bseg WITH EMPTY KEY,

      "! Node logistik/material yang dilipat (folded) ke node induk.
      "! Standar F2577 tidak merender dokumen pergerakan barang sebagai kartu
      "! tersendiri; informasinya hanya muncul pada detail node induk.
      BEGIN OF ty_folded,
        parent TYPE string,
        node   TYPE string,
        vbtyp  TYPE vbtyp,
        title  TYPE string,
      END OF ty_folded,
      tt_folded TYPE STANDARD TABLE OF ty_folded WITH EMPTY KEY,

      tt_result TYPE STANDARD TABLE OF zr_sd_docrelation WITH EMPTY KEY .

    DATA mv_anchor    TYPE vbeln .
    DATA mv_anchor_ex TYPE string .
    DATA mt_docs      TYPE tt_doc .
    DATA mt_raw_edge  TYPE tt_raw_edge .
    DATA mt_link      TYPE tt_link .
    DATA mt_vbak      TYPE tt_vbak .
    DATA mt_vbap      TYPE tt_vbap .
    DATA mt_likp      TYPE tt_likp .
    DATA mt_vbrk      TYPE tt_vbrk .
    DATA mt_bkpf      TYPE tt_bkpf .
    DATA mt_bseg      TYPE tt_bseg .
    DATA mt_folded    TYPE tt_folded .

    METHODS build_flow
      IMPORTING
        !iv_anchor       TYPE vbeln
      RETURNING
        VALUE(rt_result) TYPE tt_result .

    METHODS get_anchor_category
      IMPORTING
        !iv_doc         TYPE vbeln
      RETURNING
        VALUE(rv_vbtyp) TYPE vbtyp .

    METHODS collect_documents .

    METHODS bypass_irrelevant_edges .

    "! Transitive reduction 2-hop pada MT_LINK.
    "! Jika terdapat relasi Order -> Delivery DAN Delivery -> Invoice, maka relasi
    "! langsung Order -> Invoice dibuang. Tujuannya agar diagram tidak bercabang
    "! ganda dan node Delivery tidak terdorong ke Row 1 (standar F2577 = rantai
    "! alur lurus horizontal pada Row 0).
    METHODS prune_shortcut_links .

    METHODS read_master_data .

    "! Buang node yang tidak pernah dirender sebagai kartu pada standar F2577:
    "!  1. dokumen logistik: material document / goods movement (VBTYP 'R'/'Q')
    "!     dan returns delivery (VBTYP 'T'/'h', mis. 8420000011)
    "!  2. node tanpa rekaman master data SD (VBAK/LIKP/VBRK) - mis. dokumen
    "!     material 4900001563 yang hanya ada di MKPF/MSEG
    "! Relasi induk->anak dijembatani (bypass) agar rantai alur tetap utuh dan
    "! informasi dokumen yang dibuang dilipat ke node induk melalui MT_FOLDED.
    METHODS prune_unresolved_docs .

    "! Pastikan setiap node retur pelanggan (VBTYP 'H') punya dokumen pendahulu.
    "! Retur normalnya dibuat dengan referensi faktur, jadi relasi
    "! Invoice Part -> Return Part harus eksplisit walaupun VBFA tidak lengkap.
    METHODS link_customer_returns .

    METHODS read_accounting_documents .

    METHODS build_real_nodes
      CHANGING
        !ct_result TYPE tt_result .

    METHODS build_phantom_nodes
      CHANGING
        !ct_result TYPE tt_result .

    METHODS resolve_links
      CHANGING
        !ct_result TYPE tt_result .

    METHODS add_doc
      IMPORTING
        !iv_vbeln     TYPE vbeln
        !iv_vbtyp     TYPE vbtyp
        !iv_suffix    TYPE string OPTIONAL
      RETURNING
        VALUE(rv_new) TYPE abap_bool .

    METHODS add_link
      IMPORTING
        !iv_parent TYPE string
        !iv_child  TYPE string .

    METHODS lane_of
      IMPORTING
        !iv_vbtyp      TYPE vbtyp
      RETURNING
        VALUE(rv_lane) TYPE i .

    METHODS lane_key_of
      IMPORTING
        !iv_lane      TYPE i
      RETURNING
        VALUE(rv_key) TYPE string .

    METHODS is_relevant
      IMPORTING
        !iv_vbtyp    TYPE vbtyp
      RETURNING
        VALUE(rv_ok) TYPE abap_bool .

    METHODS doc_title_of
      IMPORTING
        !iv_vbtyp       TYPE vbtyp
      RETURNING
        VALUE(rv_title) TYPE string .

    METHODS has_child_in_lane
      IMPORTING
        !iv_node      TYPE string
        !iv_lane      TYPE i
      RETURNING
        VALUE(rv_yes) TYPE abap_bool .

    "! Cek apakah dokumen order masih memiliki delivery yang belum Post Goods Issue
    "! (LIKP-WBSTK <> 'C'). Dipakai untuk teks 'Not Shipped' pada node order,
    "! sesuai tampilan standar F2577 (barang belum keluar gudang).
    METHODS has_open_goods_issue
      IMPORTING
        !iv_node      TYPE string
      RETURNING
        VALUE(rv_yes) TYPE abap_bool .

    "! Cek apakah dari node order terdapat dokumen faktur nyata (VBRK, tidak
    "! dibatalkan, bukan pro forma) pada seluruh cabang turunannya - langsung
    "! maupun lewat delivery. VBAK hanya punya FKSAK (order-related billing),
    "! sehingga order yang ditagih via delivery tetap ber-FKSAK = 'A'.
    METHODS has_posted_invoice
      IMPORTING
        !iv_node      TYPE string
      RETURNING
        VALUE(rv_yes) TYPE abap_bool .

    "! Kode pemblokiran faktur (FAKSK/FAKSP) yang efektif untuk sebuah node.
    "! Order  : VBAK-FAKSK, lalu VBAP-FAKSP (item), lalu FAKSK delivery turunan.
    "! Delivery: LIKP-FAKSK, lalu FAKSK/FAKSP order pendahulunya.
    METHODS billing_block_of
      IMPORTING
        !iv_node        TYPE string
      RETURNING
        VALUE(rv_faksk) TYPE vbak-faksk .

    "! Apakah langkah penagihan node ini bermasalah (standar F2577: node
    "! Planned Invoice bersilang merah 'Invoicing Issue', ring lane MERAH).
    "! Benar bila ada pemblokiran faktur, ATAU barang sudah keluar gudang /
    "! order sudah terkirim penuh tetapi faktur belum pernah dibuat.
    METHODS has_invoicing_issue
      IMPORTING
        !iv_node      TYPE string
      RETURNING
        VALUE(rv_yes) TYPE abap_bool .

    "! Teks ringkas dokumen logistik yang dilipat ke node induk (MT_FOLDED).
    METHODS folded_info_of
      IMPORTING
        !iv_node       TYPE string
      RETURNING
        VALUE(rv_text) TYPE string .

    METHODS to_external
      IMPORTING
        !iv_number    TYPE clike
      RETURNING
        VALUE(rv_ext) TYPE string .

    METHODS fmt_date
      IMPORTING
        !iv_date       TYPE dats
      RETURNING
        VALUE(rv_text) TYPE string .

    METHODS fmt_amount
      IMPORTING
        !iv_amount     TYPE vbak-netwr
        !iv_currency   TYPE clike
      RETURNING
        VALUE(rv_text) TYPE string .

ENDCLASS.



CLASS zcl_sd_docflow_query IMPLEMENTATION.

  METHOD if_rap_query_provider~select.

    DATA: lt_result     TYPE tt_result,
          lt_page       TYPE tt_result,
          lt_ranges     TYPE if_rap_query_filter=>tt_name_range_pairs,
          lo_paging     TYPE REF TO if_rap_query_paging,
          lv_top        TYPE int8,
          lv_skip       TYPE int8,
          lv_index      TYPE int8,
          lv_taken      TYPE int8,
          lv_total      TYPE int8,
          lv_anchor_raw TYPE string,
          lv_anchor     TYPE vbeln.

    DATA ls_name_range LIKE LINE OF lt_ranges.
    DATA ls_range      LIKE LINE OF ls_name_range-range.

    FIELD-SYMBOLS: <ls_result> TYPE zr_sd_docrelation.

    " Reset state
    CLEAR: mv_anchor, mv_anchor_ex, mt_docs, mt_raw_edge, mt_link,
           mt_vbak, mt_vbap, mt_likp, mt_vbrk, mt_bkpf, mt_bseg, mt_folded.

    TRY.
        " 1. Filter: AnchorSalesDocument
        IF io_request->get_filter( ) IS BOUND.
          TRY.
              lt_ranges = io_request->get_filter( )->get_as_ranges( ).
            CATCH cx_rap_query_filter_no_range.
              CLEAR lt_ranges.
          ENDTRY.
        ENDIF.

        IF lt_ranges IS NOT INITIAL.
          LOOP AT lt_ranges INTO ls_name_range.
            IF to_upper( ls_name_range-name ) <> 'ANCHORSALESDOCUMENT'.
              CONTINUE.
            ENDIF.
            LOOP AT ls_name_range-range INTO ls_range.
              IF ls_range-low IS NOT INITIAL.
                lv_anchor_raw = ls_range-low.
                EXIT.
              ENDIF.
            ENDLOOP.
            IF lv_anchor_raw IS NOT INITIAL.
              EXIT.
            ENDIF.
          ENDLOOP.
        ENDIF.

        " 2. Tanpa anchor -> balas kosong
        IF lv_anchor_raw IS INITIAL.
          IF io_request->is_total_numb_of_rec_requested( ).
            io_response->set_total_number_of_records( 0 ).
          ENDIF.
          IF io_request->is_data_requested( ).
            io_response->set_data( lt_result ).
          ENDIF.
          RETURN.
        ENDIF.

        CONDENSE lv_anchor_raw.
        lv_anchor = |{ lv_anchor_raw ALPHA = IN }|.

        " 3. Bangun alur
        lt_result = build_flow( iv_anchor = lv_anchor ).
        lv_total  = lines( lt_result ).

        " 4. Paging
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
        CLEAR lt_result.
        IF io_request->is_total_numb_of_rec_requested( ).
          io_response->set_total_number_of_records( 0 ).
        ENDIF.
        IF io_request->is_data_requested( ).
          io_response->set_data( lt_result ).
        ENDIF.
    ENDTRY.

  ENDMETHOD.

  METHOD build_flow.

    DATA lv_vbtyp TYPE vbtyp.

    mv_anchor    = iv_anchor.
    mv_anchor_ex = to_external( iv_anchor ).

    lv_vbtyp = get_anchor_category( iv_anchor ).
    IF lv_vbtyp IS INITIAL.
      RETURN.
    ENDIF.

    add_doc( iv_vbeln = iv_anchor
             iv_vbtyp = lv_vbtyp ).

    collect_documents( ).
    bypass_irrelevant_edges( ).
    read_master_data( ).

    " Dokumen material (pergerakan barang) tidak punya master SD -> dibuang
    " sebelum node dibangun supaya tidak ada kartu liar seperti
    " 'Returns Delivery 4900001563' (standar F2577 melipatnya ke node induk).
    prune_unresolved_docs( ).

    link_customer_returns( ).
    read_accounting_documents( ).

    " Semua relasi sudah lengkap (VBFA + BKPF) -> baru bisa dilakukan
    " pemangkasan relasi pintas Order -> Invoice.
    prune_shortcut_links( ).

    build_real_nodes( CHANGING ct_result = rt_result ).
    build_phantom_nodes( CHANGING ct_result = rt_result ).
    resolve_links( CHANGING ct_result = rt_result ).

    SORT rt_result BY SortOrder DocNumber.

  ENDMETHOD.

  METHOD get_anchor_category.

    DATA: lv_vbtyp_vbak TYPE vbak-vbtyp,
          lv_vbtyp_likp TYPE likp-vbtyp,
          lv_vbtyp_vbrk TYPE vbrk-vbtyp.

    SELECT SINGLE vbtyp FROM vbak WHERE vbeln = @iv_doc INTO @lv_vbtyp_vbak.
    IF sy-subrc = 0 AND lv_vbtyp_vbak IS NOT INITIAL.
      rv_vbtyp = lv_vbtyp_vbak.
      RETURN.
    ENDIF.

    SELECT SINGLE vbtyp FROM likp WHERE vbeln = @iv_doc INTO @lv_vbtyp_likp.
    IF sy-subrc = 0 AND lv_vbtyp_likp IS NOT INITIAL.
      rv_vbtyp = lv_vbtyp_likp.
      RETURN.
    ENDIF.

    SELECT SINGLE vbtyp FROM vbrk WHERE vbeln = @iv_doc INTO @lv_vbtyp_vbrk.
    IF sy-subrc = 0 AND lv_vbtyp_vbrk IS NOT INITIAL.
      rv_vbtyp = lv_vbtyp_vbrk.
      RETURN.
    ENDIF.

  ENDMETHOD.

  METHOD collect_documents.

    DATA: lt_seed   TYPE tt_key,
          lt_next   TYPE tt_key,
          lt_up     TYPE tt_vbfa,
          lt_down   TYPE tt_vbfa,
          lt_remove TYPE string_table,
          ls_vbfa   TYPE ty_vbfa,
          ls_key    TYPE ty_key,
          ls_doc    TYPE ty_doc,
          lv_node   TYPE string,
          lv_level  TYPE i.

    ls_key-vbeln = mv_anchor.
    APPEND ls_key TO lt_seed.

    WHILE lt_seed IS NOT INITIAL
      AND lv_level < mc_max_level
      AND lines( mt_docs ) < mc_max_nodes.

      lv_level = lv_level + 1.
      CLEAR: lt_up, lt_down, lt_next.

      SELECT vbelv, vbeln, vbtyp_v, vbtyp_n
        FROM vbfa
        FOR ALL ENTRIES IN @lt_seed
        WHERE vbelv = @lt_seed-vbeln
        INTO TABLE @lt_down.

      SELECT vbelv, vbeln, vbtyp_v, vbtyp_n
        FROM vbfa
        FOR ALL ENTRIES IN @lt_seed
        WHERE vbeln = @lt_seed-vbeln
        INTO TABLE @lt_up.

      APPEND LINES OF lt_up TO lt_down.

      LOOP AT lt_down INTO ls_vbfa.

        IF ls_vbfa-vbelv IS INITIAL OR ls_vbfa-vbeln IS INITIAL.
          CONTINUE.
        ENDIF.

        INSERT VALUE #( vbelv = ls_vbfa-vbelv
                        vbeln = ls_vbfa-vbeln ) INTO TABLE mt_raw_edge.

        IF add_doc( iv_vbeln = ls_vbfa-vbelv
                    iv_vbtyp = CONV vbtyp( ls_vbfa-vbtyp_v ) ) = abap_true.
          IF is_relevant( CONV vbtyp( ls_vbfa-vbtyp_v ) ) = abap_true.
            CLEAR ls_key.
            ls_key-vbeln = ls_vbfa-vbelv.
            APPEND ls_key TO lt_next.
          ENDIF.
        ENDIF.

        IF add_doc( iv_vbeln = ls_vbfa-vbeln
                    iv_vbtyp = CONV vbtyp( ls_vbfa-vbtyp_n ) ) = abap_true.
          IF is_relevant( CONV vbtyp( ls_vbfa-vbtyp_n ) ) = abap_true.
            CLEAR ls_key.
            ls_key-vbeln = ls_vbfa-vbeln.
            APPEND ls_key TO lt_next.
          ENDIF.
        ENDIF.

      ENDLOOP.

      SORT lt_next BY vbeln.
      DELETE ADJACENT DUPLICATES FROM lt_next COMPARING vbeln.
      lt_seed = lt_next.

    ENDWHILE.

    LOOP AT mt_docs INTO ls_doc.
      IF is_relevant( ls_doc-vbtyp ) = abap_false
         AND ls_doc-vbeln <> mv_anchor.
        APPEND ls_doc-node TO lt_remove.
      ENDIF.
    ENDLOOP.

    LOOP AT lt_remove INTO lv_node.
      DELETE mt_docs WHERE node = lv_node.
    ENDLOOP.

  ENDMETHOD.

  METHOD bypass_irrelevant_edges.

    DATA: ls_edge   TYPE ty_raw_edge,
          ls_edge2  TYPE ty_raw_edge,
          lv_parent TYPE string,
          lv_child  TYPE string.

    LOOP AT mt_raw_edge INTO ls_edge.

      lv_parent = to_external( ls_edge-vbelv ).
      lv_child  = to_external( ls_edge-vbeln ).

      IF line_exists( mt_docs[ node = lv_parent ] )
         AND line_exists( mt_docs[ node = lv_child ] ).
        add_link( iv_parent = lv_parent
                  iv_child  = lv_child ).
        CONTINUE.
      ENDIF.

      IF line_exists( mt_docs[ node = lv_parent ] )
         AND NOT line_exists( mt_docs[ node = lv_child ] ).
        LOOP AT mt_raw_edge INTO ls_edge2 WHERE vbelv = ls_edge-vbeln.
          lv_child = to_external( ls_edge2-vbeln ).
          IF line_exists( mt_docs[ node = lv_child ] ).
            add_link( iv_parent = lv_parent
                      iv_child  = lv_child ).
          ENDIF.
        ENDLOOP.
      ENDIF.

    ENDLOOP.

  ENDMETHOD.

  METHOD prune_shortcut_links.

    DATA: lt_snapshot TYPE tt_link,
          lt_remove   TYPE tt_link,
          ls_link     TYPE ty_link,
          ls_mid      TYPE ty_link.

    IF lines( mt_link ) < 2.
      RETURN.
    ENDIF.

    " Snapshot dipakai sebagai sumber evaluasi supaya penghapusan satu relasi
    " tidak mempengaruhi keputusan relasi lain (hasil deterministik).
    lt_snapshot = mt_link.

    LOOP AT lt_snapshot INTO ls_link.

      " Cari node perantara M: parent -> M dan M -> child.
      LOOP AT lt_snapshot INTO ls_mid WHERE parent = ls_link-parent
                                        AND child  <> ls_link-child.

        IF line_exists( lt_snapshot[ parent = ls_mid-child
                                     child  = ls_link-child ] ).
          " parent -> child adalah relasi pintas (shortcut) -> buang.
          INSERT ls_link INTO TABLE lt_remove.
          EXIT.
        ENDIF.

      ENDLOOP.

    ENDLOOP.

    LOOP AT lt_remove INTO ls_link.
      DELETE mt_link WHERE parent = ls_link-parent
                       AND child  = ls_link-child.
    ENDLOOP.

  ENDMETHOD.

  METHOD read_master_data.

    DATA: lt_key_ord TYPE tt_key,
          lt_key_dlv TYPE tt_key,
          lt_key_bil TYPE tt_key,
          ls_key     TYPE ty_key,
          ls_doc     TYPE ty_doc.

    LOOP AT mt_docs INTO ls_doc.
      CLEAR ls_key.
      ls_key-vbeln = ls_doc-vbeln.
      CASE ls_doc-lane.
        WHEN mc_lane-inquiry OR mc_lane-quotation OR mc_lane-order
          OR mc_lane-customer_return.
          " Lane retur hanya memuat order retur (VBTYP 'H') karena dokumen
          " Returns Delivery tidak dirender sebagai kartu (lihat PRUNE_UNRESOLVED_DOCS).
          APPEND ls_key TO lt_key_ord.
        WHEN mc_lane-delivery.
          APPEND ls_key TO lt_key_dlv.
        WHEN mc_lane-invoicing.
          APPEND ls_key TO lt_key_bil.
      ENDCASE.
    ENDLOOP.

    IF lt_key_ord IS NOT INITIAL.
      SELECT vbeln, erdat, ernam, audat, vdatu, bnddt, vbtyp, netwr, waerk,
             lifsk, faksk, abstk, lfstk, fksak, gbstk
        FROM vbak
        FOR ALL ENTRIES IN @lt_key_ord
        WHERE vbeln = @lt_key_ord-vbeln
        INTO TABLE @mt_vbak.

      " Pemblokiran faktur sering hanya ada di level item (VBAP-FAKSP), bukan
      " di header (VBAK-FAKSK). Tanpa ini, node Planned Invoice tidak pernah
      " menjadi 'Invoicing Issue' walau penagihan benar-benar terblokir.
      SELECT vbeln, posnr, faksp
        FROM vbap
        FOR ALL ENTRIES IN @lt_key_ord
        WHERE vbeln = @lt_key_ord-vbeln
          AND faksp <> @space
        INTO TABLE @mt_vbap.
    ENDIF.

    IF lt_key_dlv IS NOT INITIAL.
      SELECT vbeln, erdat, ernam, vbtyp, lfdat, wadat, wadat_ist,
             lifsk, faksk, wbstk, kostk, trsta, kunnr
        FROM likp
        FOR ALL ENTRIES IN @lt_key_dlv
        WHERE vbeln = @lt_key_dlv-vbeln
        INTO TABLE @mt_likp.
    ENDIF.

    IF lt_key_bil IS NOT INITIAL.
      SELECT vbeln, erdat, ernam, fkdat, vbtyp, fkart, netwr, waerk,
             rfbsk, fksto, sfakn, kunag
        FROM vbrk
        FOR ALL ENTRIES IN @lt_key_bil
        WHERE vbeln = @lt_key_bil-vbeln
        INTO TABLE @mt_vbrk.
    ENDIF.

  ENDMETHOD.

  METHOD prune_unresolved_docs.

    DATA: lt_drop    TYPE tt_doc_sort,
          ls_doc     TYPE ty_doc,
          ls_link    TYPE ty_link,
          ls_folded  TYPE ty_folded,
          lt_parent  TYPE string_table,
          lt_child   TYPE string_table,
          lv_parent  TYPE string,
          lv_child   TYPE string,
          lv_missing TYPE abap_bool.

    LOOP AT mt_docs INTO ls_doc.

      " Anchor selalu dipertahankan supaya diagram tidak pernah kosong.
      IF ls_doc-vbeln = mv_anchor.
        CONTINUE.
      ENDIF.

      CLEAR lv_missing.

      " Dokumen logistik yang standar F2577 TIDAK pernah render sebagai kartu:
      "  - 'R'/'Q' : material document / pergerakan barang (mis. 4900001563)
      "  - 'T'/'h' : returns delivery (mis. 8420000011) -> dilipat ke Return Part
      IF ls_doc-vbtyp = 'R' OR ls_doc-vbtyp = 'Q'
         OR ls_doc-vbtyp = 'T' OR ls_doc-vbtyp = 'h'.
        APPEND ls_doc TO lt_drop.
        CONTINUE.
      ENDIF.

      CASE ls_doc-lane.
        WHEN mc_lane-inquiry OR mc_lane-quotation OR mc_lane-order.
          lv_missing = xsdbool( NOT line_exists( mt_vbak[ vbeln = ls_doc-vbeln ] ) ).
        WHEN mc_lane-delivery.
          lv_missing = xsdbool( NOT line_exists( mt_likp[ vbeln = ls_doc-vbeln ] ) ).
        WHEN mc_lane-invoicing.
          lv_missing = xsdbool( NOT line_exists( mt_vbrk[ vbeln = ls_doc-vbeln ] ) ).
        WHEN mc_lane-customer_return.
          lv_missing = xsdbool( NOT line_exists( mt_vbak[ vbeln = ls_doc-vbeln ] ) ).
        WHEN OTHERS.
          " Lane Accounting baru diisi setelah metode ini dijalankan -> lewati.
          CONTINUE.
      ENDCASE.

      IF lv_missing = abap_true.
        APPEND ls_doc TO lt_drop.
      ENDIF.

    ENDLOOP.

    LOOP AT lt_drop INTO ls_doc.

      CLEAR: lt_parent, lt_child.

      LOOP AT mt_link INTO ls_link WHERE child = ls_doc-node.
        APPEND ls_link-parent TO lt_parent.
      ENDLOOP.
      LOOP AT mt_link INTO ls_link WHERE parent = ls_doc-node.
        APPEND ls_link-child TO lt_child.
      ENDLOOP.

      " Jembatani relasi induk -> anak agar rantai alur tidak terputus.
      LOOP AT lt_parent INTO lv_parent.
        LOOP AT lt_child INTO lv_child.
          add_link( iv_parent = lv_parent
                    iv_child  = lv_child ).
        ENDLOOP.
      ENDLOOP.

      DELETE mt_link WHERE parent = ls_doc-node
                        OR child  = ls_doc-node.
      DELETE mt_docs WHERE node = ls_doc-node.

      " Informasi dokumen yang dibuang dilipat ke node induk (popover detail).
      LOOP AT lt_parent INTO lv_parent.
        CLEAR ls_folded.
        ls_folded-parent = lv_parent.
        ls_folded-node   = ls_doc-node.
        ls_folded-vbtyp  = ls_doc-vbtyp.
        ls_folded-title  = doc_title_of( ls_doc-vbtyp ).
        APPEND ls_folded TO mt_folded.
      ENDLOOP.

    ENDLOOP.

  ENDMETHOD.

  METHOD link_customer_returns.

    DATA: ls_doc      TYPE ty_doc,
          ls_cand     TYPE ty_doc,
          lt_snapshot TYPE tt_doc,
          lv_parent   TYPE string,
          lv_has      TYPE abap_bool.

    lt_snapshot = mt_docs.

    LOOP AT lt_snapshot INTO ls_doc WHERE lane = mc_lane-customer_return.

      IF ls_doc-vbtyp <> 'H'.
        CONTINUE.
      ENDIF.

      CLEAR: lv_has, lv_parent.

      LOOP AT mt_link TRANSPORTING NO FIELDS WHERE child = ls_doc-node.
        lv_has = abap_true.
        EXIT.
      ENDLOOP.
      IF lv_has = abap_true.
        CONTINUE.
      ENDIF.

      " Prioritas pendahulu retur: Faktur -> Delivery -> Order.
      LOOP AT lt_snapshot INTO ls_cand WHERE lane = mc_lane-invoicing.
        IF ls_cand-vbtyp = 'M' OR ls_cand-vbtyp = 'O' OR ls_cand-vbtyp = 'P'.
          lv_parent = ls_cand-node.
        ENDIF.
      ENDLOOP.

      IF lv_parent IS INITIAL.
        LOOP AT lt_snapshot INTO ls_cand WHERE lane = mc_lane-delivery.
          lv_parent = ls_cand-node.
        ENDLOOP.
      ENDIF.

      IF lv_parent IS INITIAL.
        LOOP AT lt_snapshot INTO ls_cand WHERE lane = mc_lane-order.
          lv_parent = ls_cand-node.
        ENDLOOP.
      ENDIF.

      IF lv_parent IS NOT INITIAL.
        add_link( iv_parent = lv_parent
                  iv_child  = ls_doc-node ).
      ENDIF.

    ENDLOOP.

  ENDMETHOD.

  METHOD read_accounting_documents.

    DATA: lt_awkey  TYPE tt_awkey,
          ls_awkey  TYPE ty_awkey,
          ls_bkpf   TYPE ty_bkpf,
          ls_vbrk   TYPE ty_vbrk,
          lv_je_doc TYPE vbeln,
          lv_suffix TYPE string,
          lv_bil    TYPE string,
          lv_je     TYPE string.

    IF mt_vbrk IS INITIAL.
      RETURN.
    ENDIF.

    LOOP AT mt_vbrk INTO ls_vbrk.
      CLEAR ls_awkey.
      ls_awkey-awkey = ls_vbrk-vbeln.
      APPEND ls_awkey TO lt_awkey.
    ENDLOOP.

    SORT lt_awkey BY awkey.
    DELETE ADJACENT DUPLICATES FROM lt_awkey COMPARING awkey.

    SELECT bukrs, belnr, gjahr, blart, budat, bldat, usnam, waers, stblg, awkey
      FROM bkpf
      FOR ALL ENTRIES IN @lt_awkey
      WHERE awtyp = 'VBRK'
        AND awkey = @lt_awkey-awkey
      INTO TABLE @mt_bkpf.

    IF mt_bkpf IS INITIAL.
      RETURN.
    ENDIF.

    LOOP AT mt_bkpf INTO ls_bkpf.

      lv_je_doc = ls_bkpf-belnr.
      lv_je     = to_external( ls_bkpf-belnr ).
      CLEAR lv_suffix.

      " Nomor dokumen FI sering identik dengan nomor faktur (satu number range).
      " Tanpa pembeda, key node Journal Entry bentrok dengan node faktur dan
      " node akuntansi hilang dari diagram. '#JE' hanya key internal; frontend
      " menampilkan nomornya tanpa sufiks.
      IF line_exists( mt_docs[ node = lv_je ] ).
        lv_suffix = '#JE'.
        lv_je     = |{ lv_je }{ lv_suffix }|.
      ENDIF.

      add_doc( iv_vbeln  = lv_je_doc
               iv_vbtyp  = CONV vbtyp( mc_je_category )
               iv_suffix = lv_suffix ).

      lv_bil = to_external( ls_bkpf-awkey(10) ).
      IF line_exists( mt_docs[ node = lv_bil ] ).
        add_link( iv_parent = lv_bil
                  iv_child  = lv_je ).
      ENDIF.
    ENDLOOP.

    SELECT bukrs, belnr, gjahr, buzei, augbl, augdt
      FROM bseg
      FOR ALL ENTRIES IN @mt_bkpf
      WHERE bukrs = @mt_bkpf-bukrs
        AND belnr = @mt_bkpf-belnr
        AND gjahr = @mt_bkpf-gjahr
        AND koart = 'D'
      INTO TABLE @mt_bseg.

  ENDMETHOD.

  METHOD build_real_nodes.

    DATA: lt_sorted      TYPE tt_doc_sort,
          ls_doc         TYPE ty_doc,
          ls_result      TYPE zr_sd_docrelation,
          ls_vbak        TYPE ty_vbak,
          ls_likp        TYPE ty_likp,
          ls_vbrk        TYPE ty_vbrk,
          ls_bkpf        TYPE ty_bkpf,
          ls_bseg        TYPE ty_bseg,
          lv_bill_sts    TYPE c LENGTH 1,
          lv_open        TYPE i,
          lv_cleared     TYPE i,
          lv_augbl       TYPE bseg-augbl,
          lv_augdt       TYPE dats,
          lv_line2_blank TYPE abap_bool,
          lv_faksk       TYPE vbak-faksk,
          lv_invoiced    TYPE abap_bool,
          lv_valid_to    TYPE dats,
          lv_folded      TYPE string,
          lv_source      TYPE c LENGTH 1,
          lv_counter     TYPE i.

    lt_sorted = mt_docs.
    SORT lt_sorted BY lane node.

    LOOP AT lt_sorted INTO ls_doc.

      CLEAR: ls_result, ls_vbak, ls_likp, ls_vbrk, ls_bkpf,
             lv_bill_sts, lv_open, lv_cleared, lv_augbl, lv_augdt,
             lv_line2_blank, lv_faksk, lv_invoiced, lv_valid_to, lv_folded.

      lv_counter = lv_counter + 1.

      ls_result-AnchorSalesDocument = mv_anchor.
      ls_result-DocNumber           = ls_doc-node.
      ls_result-DocCategory         = ls_doc-vbtyp.
      ls_result-DocTitle            = doc_title_of( ls_doc-vbtyp ).
      ls_result-LaneKey             = lane_key_of( ls_doc-lane ).
      ls_result-NodeType            = 'Single'.
      ls_result-SortOrder           = ls_doc-lane * 1000 + lv_counter.
      ls_result-Status              = mc_state-neutral.
      ls_result-StatusText          = 'Open'.

      " Sumber master data node: V = VBAK, L = LIKP, B = VBRK, A = BKPF.
      " Lane Customer Return hanya memuat order retur (VBTYP 'H'); dokumen
      " Returns Delivery tidak dirender sebagai kartu pada standar F2577.
      CASE ls_doc-lane.
        WHEN mc_lane-inquiry OR mc_lane-quotation OR mc_lane-order
          OR mc_lane-customer_return.
          lv_source = 'V'.
        WHEN mc_lane-delivery.
          lv_source = 'L'.
        WHEN mc_lane-invoicing.
          lv_source = 'B'.
        WHEN mc_lane-accounting.
          lv_source = 'A'.
        WHEN OTHERS.
          lv_source = 'V'.
      ENDCASE.

      CASE lv_source.

        WHEN 'V'.

          READ TABLE mt_vbak INTO ls_vbak WITH KEY vbeln = ls_doc-vbeln.
          IF sy-subrc = 0.

            ls_result-CreatedOnDate      = ls_vbak-erdat.
            ls_result-CreatedBy          = ls_vbak-ernam.
            ls_result-NetValue           = ls_vbak-netwr.
            ls_result-Currency           = ls_vbak-waerk.
            ls_result-RequestedDelivDate = COND #( WHEN ls_vbak-vdatu IS NOT INITIAL
                                                   THEN ls_vbak-vdatu
                                                   ELSE ls_vbak-audat ).

            lv_invoiced = has_posted_invoice( ls_doc-node ).
            lv_faksk    = billing_block_of( ls_doc-node ).

            IF ls_doc-lane = mc_lane-quotation OR ls_doc-lane = mc_lane-inquiry.

              "------------------------------------------------------------------
              " Penawaran harga / inquiry (standar F2577)
              "  - Status  : 'Fully Referenced' + centang hijau begitu penawaran
              "              sudah direferensikan order (GBSTK 'C' / ada order anak)
              "  - Baris 1 : 'Valid To <Tgl>' dari VBAK-BNDDT (fallback VDATU),
              "              BUKAN 'Requested Delivery On'
              "  - Baris 2 : kosong (penawaran tidak punya pengiriman fisik)
              "------------------------------------------------------------------
              lv_valid_to = COND #( WHEN ls_vbak-bnddt IS NOT INITIAL
                                    THEN ls_vbak-bnddt
                                    ELSE ls_vbak-vdatu ).

              IF ls_vbak-abstk = 'C'.
                ls_result-Status     = mc_state-negative.
                ls_result-StatusText = 'Rejected'.
              ELSEIF ls_vbak-gbstk = 'C'
                 OR has_child_in_lane( iv_node = ls_doc-node
                                       iv_lane = mc_lane-order ) = abap_true.
                ls_result-Status     = mc_state-positive.
                ls_result-StatusText = 'Fully Referenced'.
              ELSEIF lv_valid_to IS NOT INITIAL AND lv_valid_to < sy-datum.
                ls_result-Status     = mc_state-critical.
                ls_result-StatusText = 'Validity Expired'.
              ELSEIF ls_vbak-gbstk = 'B'.
                ls_result-Status     = mc_state-critical.
                ls_result-StatusText = 'Partially Referenced'.
              ELSE.
                ls_result-Status     = mc_state-neutral.
                ls_result-StatusText = 'Open'.
              ENDIF.

              IF lv_valid_to IS NOT INITIAL.
                ls_result-ExtraLine1 = |Valid To { fmt_date( lv_valid_to ) }|.
              ELSE.
                ls_result-ExtraLine1 = |Created On { fmt_date( ls_vbak-erdat ) }|.
              ENDIF.

              CLEAR ls_result-ExtraLine2.
              lv_line2_blank = abap_true.

              ls_result-AdditionalInfo = |Overall Status { ls_vbak-gbstk } / Valid To { fmt_date( lv_valid_to ) }|.

            ELSEIF ls_doc-lane = mc_lane-customer_return.

              "------------------------------------------------------------------
              " Retur pelanggan (VBTYP 'H') - lane Customer Return Processing
              "  - Baris 1 : 'Requested Delivery On <Tgl>'
              "  - Baris 2 : 'Not Invoiced' selama belum ada nota kredit
              "------------------------------------------------------------------
              IF ls_vbak-abstk = 'C'.
                ls_result-Status     = mc_state-negative.
                ls_result-StatusText = 'Rejected'.
              ELSEIF ls_vbak-lifsk IS NOT INITIAL.
                ls_result-Status     = mc_state-negative.
                ls_result-StatusText = |Delivery Blocked ({ ls_vbak-lifsk })|.
              ELSE.
                " Permintaan retur yang diterima dihitung sebagai langkah selesai
                " pada standar F2577 (centang hijau 'Completed').
                ls_result-Status     = mc_state-positive.
                ls_result-StatusText = 'Completed'.
              ENDIF.

              IF ls_result-RequestedDelivDate IS NOT INITIAL.
                ls_result-ExtraLine1 = |Requested Delivery On { fmt_date( ls_result-RequestedDelivDate ) }|.
              ELSE.
                ls_result-ExtraLine1 = |Created On { fmt_date( ls_vbak-erdat ) }|.
              ENDIF.

              IF ls_vbak-abstk = 'C'.
                ls_result-ExtraLine2 = 'Rejected'.
              ELSEIF lv_invoiced = abap_true AND ls_vbak-fksak = 'C'.
                ls_result-ExtraLine2 = 'Completely Invoiced'.
              ELSEIF lv_invoiced = abap_true.
                ls_result-ExtraLine2 = 'Partially Invoiced'.
              ELSE.
                ls_result-ExtraLine2 = 'Not Invoiced'.
              ENDIF.

              ls_result-AdditionalInfo = |Return Status { ls_vbak-gbstk } / Delivery { ls_vbak-lfstk } / Billing { ls_vbak-fksak }|.

            ELSE.

              IF ls_vbak-abstk = 'C'.
                ls_result-Status     = mc_state-negative.
                ls_result-StatusText = 'Rejected'.
              ELSEIF ls_doc-lane = mc_lane-order
                 AND ls_vbak-lfstk = 'A'
                 AND has_child_in_lane( iv_node = ls_doc-node
                                        iv_lane = mc_lane-delivery ) = abap_false.
                " Order tertahan: sama sekali belum ada dokumen pengiriman.
                " Standar F2577 menandai node order dengan silang merah + 'Delivery Issue'.
                ls_result-Status     = mc_state-negative.
                ls_result-StatusText = 'Delivery Issue'.
              ELSEIF ls_vbak-lifsk IS NOT INITIAL.
                ls_result-Status     = mc_state-negative.
                ls_result-StatusText = |Delivery Blocked ({ ls_vbak-lifsk })|.
              ELSEIF ls_vbak-faksk IS NOT INITIAL.
                ls_result-Status     = mc_state-critical.
                ls_result-StatusText = |Billing Blocked ({ ls_vbak-faksk })|.
              ELSEIF ls_vbak-gbstk = 'C'.
                ls_result-Status     = mc_state-positive.
                ls_result-StatusText = 'Completed'.
              ELSEIF ls_vbak-gbstk = 'B' OR ls_vbak-lfstk = 'B'.
                ls_result-Status     = mc_state-critical.
                ls_result-StatusText = 'In Process'.
              ELSE.
                ls_result-Status     = mc_state-neutral.
                ls_result-StatusText = 'Open'.
              ENDIF.

              IF ls_result-RequestedDelivDate IS NOT INITIAL.
                ls_result-ExtraLine1 = |Requested Delivery On { fmt_date( ls_result-RequestedDelivDate ) }|.
              ELSE.
                ls_result-ExtraLine1 = |Created On { fmt_date( ls_vbak-erdat ) }|.
              ENDIF.

              " Status penagihan efektif node order.
              " VBAK hanya menyediakan FKSAK (order-related billing). Untuk order
              " yang ditagih lewat delivery, FKSAK tetap 'A', jadi keberadaan
              " dokumen faktur nyata pada alur dipakai sebagai sumber kebenaran.
              lv_bill_sts = ls_vbak-fksak.
              IF lv_bill_sts <> 'C' AND lv_invoiced = abap_true.
                IF ls_vbak-lfstk = 'C' OR ls_vbak-gbstk = 'C'.
                  lv_bill_sts = 'C'.
                ELSE.
                  lv_bill_sts = 'B'.
                ENDIF.
              ENDIF.

              " Baris kedua node order (standar F2577):
              "  - faktur sudah lengkap                     -> 'Completely Invoiced'
              "  - masih ada delivery belum PGI             -> 'Not Shipped'
              "  - ada billing block / delivery sudah PGI
              "    tetapi belum ada faktur                  -> 'Not Invoiced'
              IF ls_vbak-abstk = 'C'.
                ls_result-ExtraLine2 = 'Rejected'.
              ELSEIF lv_bill_sts = 'C'.
                ls_result-ExtraLine2 = 'Completely Invoiced'.
              ELSEIF has_open_goods_issue( ls_doc-node ) = abap_true.
                ls_result-ExtraLine2 = 'Not Shipped'.
              ELSEIF lv_invoiced = abap_false AND lv_faksk IS NOT INITIAL.
                " Pemblokiran faktur (VBAK-FAKSK / LIKP-FAKSK) -> Invoicing Issue.
                ls_result-ExtraLine2 = 'Not Invoiced'.
              ELSEIF lv_bill_sts = 'B'.
                ls_result-ExtraLine2 = 'Partially Invoiced'.
              ELSEIF ls_vbak-lfstk = 'C' AND lv_invoiced = abap_false.
                ls_result-ExtraLine2 = 'Not Invoiced'.
              ELSEIF ls_vbak-lfstk = 'C'.
                ls_result-ExtraLine2 = 'Completely Delivered'.
              ELSEIF ls_vbak-lfstk = 'B'.
                ls_result-ExtraLine2 = 'Partially Shipped'.
              ELSE.
                ls_result-ExtraLine2 = 'Not Shipped'.
              ENDIF.

              ls_result-AdditionalInfo = |Overall Status { ls_vbak-gbstk } / Delivery { ls_vbak-lfstk } / Billing { lv_bill_sts }|.
              IF lv_faksk IS NOT INITIAL.
                ls_result-AdditionalInfo = |{ ls_result-AdditionalInfo } / Billing Block { lv_faksk }|.
              ENDIF.

            ENDIF.
          ENDIF.

        WHEN 'L'.

          READ TABLE mt_likp INTO ls_likp WITH KEY vbeln = ls_doc-vbeln.
          IF sy-subrc = 0.

            ls_result-CreatedOnDate  = ls_likp-erdat.
            ls_result-CreatedBy      = ls_likp-ernam.
            ls_result-GoodsIssueDate = ls_likp-wadat_ist.

            " Status node delivery (standar F2577):
            "  - PGI selesai (WBSTK = 'C') -> Positive 'Shipped',
            "    hanya 1 baris teks 'Shipped On <Tgl>' (baris kedua kosong)
            "  - delivery block            -> Negative 'Delivery Blocked'
            "  - PGI belum diposting       -> Negative 'Incomplete'
            IF ls_likp-wbstk = 'C'.

              ls_result-Status     = mc_state-positive.
              ls_result-StatusText = 'Shipped'.

              IF ls_likp-wadat_ist IS NOT INITIAL.
                ls_result-ExtraLine1 = |Shipped On { fmt_date( ls_likp-wadat_ist ) }|.
              ELSEIF ls_likp-wadat IS NOT INITIAL.
                ls_result-ExtraLine1 = |Shipped On { fmt_date( ls_likp-wadat ) }|.
              ELSE.
                ls_result-ExtraLine1 = |Shipped On { fmt_date( ls_likp-erdat ) }|.
              ENDIF.

              " Baris kedua sengaja dikosongkan (identik standar SAP).
              CLEAR ls_result-ExtraLine2.
              lv_line2_blank = abap_true.

            ELSE.

              IF ls_likp-lifsk IS NOT INITIAL.
                ls_result-Status     = mc_state-negative.
                ls_result-StatusText = |Delivery Blocked ({ ls_likp-lifsk })|.
              ELSE.
                ls_result-Status     = mc_state-negative.
                ls_result-StatusText = 'Incomplete'.
              ENDIF.

              IF ls_likp-wadat IS NOT INITIAL.
                ls_result-ExtraLine1 = |Shipping Planned For { fmt_date( ls_likp-wadat ) }|.
              ELSEIF ls_likp-lfdat IS NOT INITIAL.
                ls_result-ExtraLine1 = |Shipping Planned For { fmt_date( ls_likp-lfdat ) }|.
              ELSE.
                ls_result-ExtraLine1 = |Created On { fmt_date( ls_likp-erdat ) }|.
              ENDIF.

              IF ls_likp-trsta IS INITIAL OR ls_likp-trsta = 'A'.
                ls_result-ExtraLine2 = 'Open Transp.Planning'.
              ELSEIF ls_likp-trsta = 'B'.
                ls_result-ExtraLine2 = 'Transp.Planning Partial'.
              ELSE.
                ls_result-ExtraLine2 = 'Ready For Shipping'.
              ENDIF.

            ENDIF.

            ls_result-AdditionalInfo = |Goods Movement { ls_likp-wbstk } / Picking { ls_likp-kostk } / Transp. { ls_likp-trsta }|.
          ENDIF.

        WHEN 'B'.

          READ TABLE mt_vbrk INTO ls_vbrk WITH KEY vbeln = ls_doc-vbeln.
          IF sy-subrc = 0.

            ls_result-CreatedOnDate = COND #( WHEN ls_vbrk-fkdat IS NOT INITIAL
                                              THEN ls_vbrk-fkdat
                                              ELSE ls_vbrk-erdat ).
            ls_result-CreatedBy     = ls_vbrk-ernam.
            ls_result-BillingDate   = ls_vbrk-fkdat.
            ls_result-NetValue      = ls_vbrk-netwr.
            ls_result-Currency      = ls_vbrk-waerk.

            IF ls_vbrk-fksto = 'X'.
              ls_result-Status       = mc_state-negative.
              ls_result-StatusText   = 'Canceled Invoice'.
              ls_result-ReferenceDoc = to_external( ls_vbrk-sfakn ).
            ELSEIF ls_vbrk-rfbsk = 'E' OR ls_vbrk-rfbsk = '5'.
              ls_result-Status     = mc_state-negative.
              ls_result-StatusText = 'No Journal Entry'.
            ELSEIF ls_vbrk-rfbsk = 'C'.
              " Faktur sudah diteruskan ke akuntansi -> standar F2577 menampilkan
              " centang hijau dengan teks status 'Completed'.
              ls_result-Status     = mc_state-positive.
              ls_result-StatusText = 'Completed'.
            ELSEIF ls_vbrk-rfbsk = 'D'.
              ls_result-Status     = mc_state-neutral.
              ls_result-StatusText = 'Accounting Not Required'.
            ELSE.
              ls_result-Status     = mc_state-critical.
              ls_result-StatusText = 'Not Posted To Accounting'.
            ENDIF.

            IF ls_vbrk-fkdat IS NOT INITIAL.
              ls_result-ExtraLine1 = |Billed On { fmt_date( ls_vbrk-fkdat ) }|.
            ELSE.
              ls_result-ExtraLine1 = |Created On { fmt_date( ls_vbrk-erdat ) }|.
            ENDIF.

            ls_result-ExtraLine2 = |Net Value { fmt_amount( iv_amount   = ls_vbrk-netwr
                                                            iv_currency = ls_vbrk-waerk ) } { ls_vbrk-waerk }|.

            ls_result-AdditionalInfo = |Billing Type { ls_vbrk-fkart } / Accounting Status { ls_vbrk-rfbsk }|.
            IF ls_vbrk-sfakn IS NOT INITIAL.
              ls_result-AdditionalInfo = |{ ls_result-AdditionalInfo } / Cancels { to_external( ls_vbrk-sfakn ) }|.
            ENDIF.
          ENDIF.

        WHEN 'A'.

          READ TABLE mt_bkpf INTO ls_bkpf WITH KEY belnr = ls_doc-vbeln.
          IF sy-subrc = 0.

            ls_result-CreatedOnDate = ls_bkpf-budat.
            ls_result-PostingDate   = ls_bkpf-budat.
            ls_result-CreatedBy     = ls_bkpf-usnam.
            ls_result-Currency      = ls_bkpf-waers.

            LOOP AT mt_bseg INTO ls_bseg WHERE bukrs = ls_bkpf-bukrs
                                           AND belnr = ls_bkpf-belnr
                                           AND gjahr = ls_bkpf-gjahr.
              IF ls_bseg-augbl IS INITIAL.
                lv_open = lv_open + 1.
              ELSE.
                lv_cleared = lv_cleared + 1.
                lv_augbl   = ls_bseg-augbl.
                lv_augdt   = ls_bseg-augdt.
              ENDIF.
            ENDLOOP.

            " Standar F2577 tidak pernah mengulang teks status pada baris teks
            " kartu. Baris kedua hanya diisi bila membawa informasi tambahan
            " (dokumen pembatal / dokumen pelunasan); selain itu dikosongkan.
            IF ls_bkpf-stblg IS NOT INITIAL.
              ls_result-Status       = mc_state-negative.
              ls_result-StatusText   = 'Reversed'.
              ls_result-ReferenceDoc = to_external( ls_bkpf-stblg ).
              ls_result-ExtraLine2   = |Reversed By { to_external( ls_bkpf-stblg ) }|.
            ELSEIF lv_cleared > 0 AND lv_open = 0.
              ls_result-Status       = mc_state-positive.
              ls_result-StatusText   = 'Cleared'.
              ls_result-ReferenceDoc = to_external( lv_augbl ).
              ls_result-ExtraLine2   = |Cleared By { to_external( lv_augbl ) }|.
            ELSEIF lv_cleared > 0 AND lv_open > 0.
              ls_result-Status       = mc_state-critical.
              ls_result-StatusText   = 'Partially Cleared'.
              ls_result-ReferenceDoc = to_external( lv_augbl ).
              CLEAR ls_result-ExtraLine2.
              lv_line2_blank = abap_true.
            ELSE.
              " Open item belum dibayar/clearing: standar F2577 menampilkan node
              " netral (ring donat lane Accounting berwarna abu-abu), bukan warning.
              ls_result-Status     = mc_state-neutral.
              ls_result-StatusText = 'Not Cleared'.
              CLEAR ls_result-ExtraLine2.
              lv_line2_blank = abap_true.
            ENDIF.

            IF ls_bkpf-budat IS NOT INITIAL.
              ls_result-ExtraLine1 = |Posted On { fmt_date( ls_bkpf-budat ) }|.
            ENDIF.

            ls_result-AdditionalInfo = |Company Code { ls_bkpf-bukrs } / Fiscal Year { ls_bkpf-gjahr } / Doc.Type { ls_bkpf-blart }|.
            IF lv_augdt IS NOT INITIAL.
              ls_result-AdditionalInfo = |{ ls_result-AdditionalInfo } / Cleared On { fmt_date( lv_augdt ) }|.
            ENDIF.
          ENDIF.

      ENDCASE.

      IF ls_result-ExtraLine1 IS INITIAL.
        ls_result-ExtraLine1 = |Document { ls_doc-node }|.
      ENDIF.
      " Baris kedua hanya diisi otomatis bila tidak sengaja dikosongkan
      " (mis. node delivery 'Shipped' yang hanya punya 1 baris teks).
      IF ls_result-ExtraLine2 IS INITIAL AND lv_line2_blank = abap_false.
        ls_result-ExtraLine2 = ls_result-StatusText.
      ENDIF.

      " Dokumen logistik yang tidak dirender sebagai kartu (mis. material
      " document pergerakan barang) dilipat ke detail node induk.
      lv_folded = folded_info_of( ls_doc-node ).
      IF lv_folded IS NOT INITIAL.
        IF ls_result-AdditionalInfo IS INITIAL.
          ls_result-AdditionalInfo = lv_folded.
        ELSE.
          ls_result-AdditionalInfo = |{ ls_result-AdditionalInfo } / { lv_folded }|.
        ENDIF.
      ENDIF.

      APPEND ls_result TO ct_result.

    ENDLOOP.

  ENDMETHOD.

  METHOD build_phantom_nodes.

    DATA: ls_doc       TYPE ty_doc,
          ls_result    TYPE zr_sd_docrelation,
          ls_vbak      TYPE ty_vbak,
          ls_likp      TYPE ty_likp,
          ls_vbrk      TYPE ty_vbrk,
          lv_bill_sts  TYPE c LENGTH 1,
          lv_faksk     TYPE vbak-faksk,
          lv_node      TYPE string,
          lv_node_inv  TYPE string,
          lv_seq       TYPE i,
          lt_snapshot  TYPE tt_doc.

    lt_snapshot = mt_docs.

    LOOP AT lt_snapshot INTO ls_doc.

      CLEAR: ls_result, ls_vbak, ls_likp, ls_vbrk, lv_bill_sts, lv_faksk,
             lv_node, lv_node_inv.

      CASE ls_doc-lane.

        WHEN mc_lane-order.

          IF ls_doc-vbtyp <> 'C' AND ls_doc-vbtyp <> 'G'
             AND ls_doc-vbtyp <> 'I'.
            CONTINUE.
          ENDIF.

          IF has_child_in_lane( iv_node = ls_doc-node
                                iv_lane = mc_lane-delivery ) = abap_true.
            CONTINUE.
          ENDIF.

          READ TABLE mt_vbak INTO ls_vbak WITH KEY vbeln = ls_doc-vbeln.
          IF sy-subrc <> 0.
            CONTINUE.
          ENDIF.

          IF ls_vbak-abstk = 'C'.
            CONTINUE.
          ENDIF.

          IF ls_vbak-lfstk <> 'A' AND ls_vbak-lfstk <> 'B'.
            CONTINUE.
          ENDIF.

          IF has_child_in_lane( iv_node = ls_doc-node
                                iv_lane = mc_lane-invoicing ) = abap_true.
            CONTINUE.
          ENDIF.

          lv_seq  = lv_seq + 1.
          lv_node = |PLDEL_{ ls_doc-node }|.

          ls_result-AnchorSalesDocument = mv_anchor.
          ls_result-DocNumber           = lv_node.
          ls_result-DocCategory         = 'J'.
          ls_result-DocTitle            = 'Planned Delivery'.
          ls_result-LaneKey             = mc_lane_key-delivery.
          ls_result-NodeType            = 'Planned'.
          ls_result-SortOrder           = mc_lane-delivery * 1000 + 900 + lv_seq.
          ls_result-CreatedOnDate       = ls_vbak-erdat.
          ls_result-CreatedBy           = ls_vbak-ernam.
          ls_result-RequestedDelivDate  = COND #( WHEN ls_vbak-vdatu IS NOT INITIAL
                                                  THEN ls_vbak-vdatu
                                                  ELSE ls_vbak-audat ).

          IF ls_vbak-lifsk IS NOT INITIAL.
            ls_result-Status     = mc_state-planned_negative.
            ls_result-StatusText = |Delivery Blocked ({ ls_vbak-lifsk })|.
          ELSE.
            ls_result-Status     = mc_state-planned.
            ls_result-StatusText = 'Not Yet Delivered'.
          ENDIF.

          " Standar F2577: node Planned Delivery hanya menampilkan 1 baris teks
          " 'Delivery Planned For <Tgl>'. Baris kedua sengaja dikosongkan.
          IF ls_result-RequestedDelivDate IS NOT INITIAL.
            ls_result-ExtraLine1 = |Delivery Planned For { fmt_date( ls_result-RequestedDelivDate ) }|.
          ELSE.
            ls_result-ExtraLine1 = 'Delivery Planned'.
          ENDIF.
          CLEAR ls_result-ExtraLine2.

          ls_result-AdditionalInfo = |Planned node (tidak ada di VBFA). Preceding: { ls_doc-node }|.

          APPEND ls_result TO ct_result.
          add_link( iv_parent = ls_doc-node
                    iv_child  = lv_node ).

          lv_bill_sts = ls_vbak-fksak.

          IF lv_bill_sts = 'A' OR lv_bill_sts = 'B'.

            CLEAR ls_result.
            lv_node_inv = |PLINV_{ ls_doc-node }|.

            ls_result-AnchorSalesDocument = mv_anchor.
            ls_result-DocNumber           = lv_node_inv.
            ls_result-DocCategory         = 'M'.
            ls_result-DocTitle            = 'Planned Invoice'.
            ls_result-LaneKey             = mc_lane_key-invoicing.
            ls_result-NodeType            = 'Planned'.
            ls_result-SortOrder           = mc_lane-invoicing * 1000 + 900 + lv_seq.
            ls_result-CreatedOnDate       = ls_vbak-erdat.
            ls_result-CreatedBy           = ls_vbak-ernam.

            " Standar F2577: penagihan bermasalah (pemblokiran faktur atau barang
            " sudah terkirim penuh tanpa faktur) membuat node Planned Invoice
            " bersilang merah 'Invoicing Issue' (PlannedNegative), sehingga ring
            " donat lane Invoicing ikut MERAH.
            lv_faksk = billing_block_of( ls_doc-node ).
            IF has_invoicing_issue( ls_doc-node ) = abap_true.
              ls_result-Status     = mc_state-planned_negative.
              ls_result-StatusText = 'Invoicing Issue'.
              IF lv_faksk IS NOT INITIAL.
                ls_result-ExtraLine2 = |Billing Blocked ({ lv_faksk })|.
              ELSE.
                CLEAR ls_result-ExtraLine2.
              ENDIF.
            ELSE.
              ls_result-Status     = mc_state-planned.
              ls_result-StatusText = 'Not Yet Invoiced'.
              " Standar F2577: node Planned Invoice hanya menampilkan 1 baris
              " (rencana penagihan). Baris kedua sengaja dikosongkan.
              CLEAR ls_result-ExtraLine2.
            ENDIF.
            ls_result-ExtraLine1     = 'Billing Planned After Delivery'.
            ls_result-AdditionalInfo = |Planned node (tidak ada di VBFA). Preceding: { lv_node }|.

            APPEND ls_result TO ct_result.
            add_link( iv_parent = lv_node
                      iv_child  = lv_node_inv ).
          ENDIF.

        WHEN mc_lane-delivery.

          IF has_child_in_lane( iv_node = ls_doc-node
                                iv_lane = mc_lane-invoicing ) = abap_true.
            CONTINUE.
          ENDIF.

          READ TABLE mt_likp INTO ls_likp WITH KEY vbeln = ls_doc-vbeln.
          IF sy-subrc <> 0.
            CONTINUE.
          ENDIF.

          lv_seq  = lv_seq + 1.
          lv_node = |PLINV_{ ls_doc-node }|.

          ls_result-AnchorSalesDocument = mv_anchor.
          ls_result-DocNumber           = lv_node.
          ls_result-DocCategory         = 'M'.
          ls_result-DocTitle            = 'Planned Invoice'.
          ls_result-LaneKey             = mc_lane_key-invoicing.
          ls_result-NodeType            = 'Planned'.
          ls_result-SortOrder           = mc_lane-invoicing * 1000 + 900 + lv_seq.
          ls_result-CreatedOnDate       = ls_likp-erdat.
          ls_result-CreatedBy           = ls_likp-ernam.
          ls_result-GoodsIssueDate      = ls_likp-wadat_ist.

          IF ls_likp-wadat_ist IS NOT INITIAL.
            ls_result-ExtraLine1 = |Billing Planned For { fmt_date( ls_likp-wadat_ist ) }|.
          ELSEIF ls_likp-wadat IS NOT INITIAL.
            ls_result-ExtraLine1 = |Billing Planned For { fmt_date( ls_likp-wadat ) }|.
          ELSE.
            ls_result-ExtraLine1 = 'Billing Planned After Goods Issue'.
          ENDIF.

          " Penagihan bermasalah pada delivery (blok faktur, atau PGI sudah
          " diposting tetapi faktur belum pernah dibuat) -> node Planned Invoice
          " bersilang merah 'Invoicing Issue'. Ini yang membuat ring donat lane
          " Invoicing berwarna MERAH di F2577.
          lv_faksk = billing_block_of( ls_doc-node ).
          IF has_invoicing_issue( ls_doc-node ) = abap_true.
            ls_result-Status     = mc_state-planned_negative.
            ls_result-StatusText = 'Invoicing Issue'.
            IF lv_faksk IS NOT INITIAL.
              ls_result-ExtraLine2 = |Billing Blocked ({ lv_faksk })|.
            ELSE.
              " Standar F2577 hanya menampilkan 1 baris teks pada kartu ini.
              CLEAR ls_result-ExtraLine2.
            ENDIF.
          ELSE.
            ls_result-Status     = mc_state-planned.
            ls_result-StatusText = 'Not Yet Invoiced'.
            " Standar F2577: node Planned Invoice hanya memiliki 1 baris teks
            " (rencana penagihan), tanpa baris status tambahan.
            CLEAR ls_result-ExtraLine2.
          ENDIF.

          ls_result-AdditionalInfo = |Planned node (tidak ada di VBFA). Preceding: { ls_doc-node }|.
          IF lv_faksk IS NOT INITIAL.
            ls_result-AdditionalInfo = |{ ls_result-AdditionalInfo } / Billing Block { lv_faksk }|.
          ENDIF.

          APPEND ls_result TO ct_result.
          add_link( iv_parent = ls_doc-node
                    iv_child  = lv_node ).

        WHEN mc_lane-invoicing.

          IF mc_planned_je <> 'X'.
            CONTINUE.
          ENDIF.

          IF has_child_in_lane( iv_node = ls_doc-node
                                iv_lane = mc_lane-accounting ) = abap_true.
            CONTINUE.
          ENDIF.

          READ TABLE mt_vbrk INTO ls_vbrk WITH KEY vbeln = ls_doc-vbeln.
          IF sy-subrc <> 0.
            CONTINUE.
          ENDIF.

          IF ls_vbrk-fksto = 'X' OR ls_vbrk-rfbsk = 'D'.
            CONTINUE.
          ENDIF.

          lv_seq  = lv_seq + 1.
          lv_node = |PLJE_{ ls_doc-node }|.

          ls_result-AnchorSalesDocument = mv_anchor.
          ls_result-DocNumber           = lv_node.
          ls_result-DocCategory         = mc_je_category.
          ls_result-DocTitle            = 'Planned Journal Entry'.
          ls_result-LaneKey             = mc_lane_key-accounting.
          ls_result-NodeType            = 'Planned'.
          ls_result-SortOrder           = mc_lane-accounting * 1000 + 900 + lv_seq.
          ls_result-CreatedOnDate       = ls_vbrk-fkdat.
          ls_result-CreatedBy           = ls_vbrk-ernam.
          ls_result-Currency            = ls_vbrk-waerk.
          ls_result-NetValue            = ls_vbrk-netwr.

          IF ls_vbrk-rfbsk = 'E' OR ls_vbrk-rfbsk = '5'.
            ls_result-Status     = mc_state-planned_negative.
            ls_result-StatusText = 'No Journal Entry'.
            ls_result-ExtraLine1 = 'Blocked For Accounting (VFX3)'.
            CLEAR ls_result-ExtraLine2.
          ELSE.
            ls_result-Status     = mc_state-planned.
            ls_result-StatusText = 'Not Yet Posted'.
            ls_result-ExtraLine1 = 'Posting To Accounting Pending'.
            CLEAR ls_result-ExtraLine2.
          ENDIF.

          ls_result-AdditionalInfo = |Planned node (tidak ada di BKPF). Preceding: { ls_doc-node } / RFBSK { ls_vbrk-rfbsk }|.

          APPEND ls_result TO ct_result.
          add_link( iv_parent = ls_doc-node
                    iv_child  = lv_node ).

      ENDCASE.

    ENDLOOP.

  ENDMETHOD.

  METHOD resolve_links.

    DATA: ls_link     TYPE ty_link,
          lt_children TYPE string_table,
          lt_parents  TYPE string_table,
          lv_node     TYPE string.

    FIELD-SYMBOLS <ls_result> TYPE zr_sd_docrelation.

    LOOP AT ct_result ASSIGNING <ls_result>.

      CLEAR: lt_children, lt_parents.

      lv_node = <ls_result>-DocNumber.

      LOOP AT mt_link INTO ls_link WHERE parent = lv_node.
        APPEND |{ mc_node_prefix }{ ls_link-child }| TO lt_children.
      ENDLOOP.

      LOOP AT mt_link INTO ls_link WHERE child = lv_node.
        APPEND |{ mc_node_prefix }{ ls_link-parent }| TO lt_parents.
      ENDLOOP.

      SORT lt_children.
      DELETE ADJACENT DUPLICATES FROM lt_children.
      SORT lt_parents.
      DELETE ADJACENT DUPLICATES FROM lt_parents.

      <ls_result>-SubsequentDocs = concat_lines_of( table = lt_children sep = ',' ).
      <ls_result>-PrecedingDocs  = concat_lines_of( table = lt_parents  sep = ',' ).

    ENDLOOP.

  ENDMETHOD.

  METHOD add_doc.

    DATA: ls_doc  TYPE ty_doc,
          lv_node TYPE string.

    IF iv_vbeln IS INITIAL.
      RETURN.
    ENDIF.

    lv_node = to_external( iv_vbeln ).
    IF iv_suffix IS NOT INITIAL.
      lv_node = |{ lv_node }{ iv_suffix }|.
    ENDIF.

    IF line_exists( mt_docs[ node = lv_node ] ).
      RETURN.
    ENDIF.

    ls_doc-node  = lv_node.
    ls_doc-vbeln = iv_vbeln.
    ls_doc-vbtyp = iv_vbtyp.
    ls_doc-lane  = lane_of( iv_vbtyp ).

    INSERT ls_doc INTO TABLE mt_docs.
    IF sy-subrc = 0.
      rv_new = abap_true.
    ENDIF.

  ENDMETHOD.

  METHOD add_link.

    IF iv_parent IS INITIAL OR iv_child IS INITIAL OR iv_parent = iv_child.
      RETURN.
    ENDIF.

    INSERT VALUE #( parent = iv_parent
                    child  = iv_child ) INTO TABLE mt_link.

  ENDMETHOD.

  METHOD lane_of.

    CASE iv_vbtyp.
      WHEN 'A'.
        rv_lane = mc_lane-inquiry.
      WHEN 'B'.
        rv_lane = mc_lane-quotation.
      WHEN 'C' OR 'E' OR 'F' OR 'G' OR 'I' OR 'K' OR 'L'.
        rv_lane = mc_lane-order.
      WHEN 'J' OR 'R' OR 'Q'.
        rv_lane = mc_lane-delivery.
      WHEN 'M' OR 'N' OR 'O' OR 'P' OR 'S' OR 'U'.
        rv_lane = mc_lane-invoicing.
      WHEN 'H' OR 'T' OR 'h'.
        " Retur pelanggan: order retur ('H') dan pengiriman retur ('T'/'h')
        " berada pada lane 'Customer Return Processing' (standar F2577).
        rv_lane = mc_lane-customer_return.
      WHEN 'g' OR 'r' OR '+'.
        rv_lane = mc_lane-accounting.
      WHEN OTHERS.
        rv_lane = mc_lane-order.
    ENDCASE.

  ENDMETHOD.

  METHOD lane_key_of.

    CASE iv_lane.
      WHEN mc_lane-inquiry.         rv_key = mc_lane_key-inquiry.
      WHEN mc_lane-quotation.       rv_key = mc_lane_key-quotation.
      WHEN mc_lane-order.           rv_key = mc_lane_key-order.
      WHEN mc_lane-delivery.        rv_key = mc_lane_key-delivery.
      WHEN mc_lane-invoicing.       rv_key = mc_lane_key-invoicing.
      WHEN mc_lane-customer_return. rv_key = mc_lane_key-customer_return.
      WHEN mc_lane-accounting.      rv_key = mc_lane_key-accounting.
      WHEN OTHERS.                  rv_key = mc_lane_key-order.
    ENDCASE.

  ENDMETHOD.

  METHOD is_relevant.

    CASE iv_vbtyp.
      WHEN 'A' OR 'B' OR 'C' OR 'E' OR 'F' OR 'G' OR 'H' OR 'I' OR 'K' OR 'L'
        OR 'J' OR 'T' OR 'h'
        OR 'M' OR 'O' OR 'P' OR 'U'
        OR 'g' OR 'r' OR '+'.
        rv_ok = abap_true.
      WHEN OTHERS.
        rv_ok = abap_false.
    ENDCASE.

  ENDMETHOD.

  METHOD doc_title_of.

    CASE iv_vbtyp.
      WHEN 'A'.            rv_title = 'Inquiry'.
      WHEN 'B'.            rv_title = 'Quotation'.
      WHEN 'C'.            rv_title = 'Sales Part'.
      WHEN 'E' OR 'F'.     rv_title = 'Scheduling Agreement'.
      WHEN 'G'.            rv_title = 'Contract'.
      WHEN 'H'.            rv_title = 'Return Part'.
      WHEN 'I'.            rv_title = 'Free of Charge Order'.
      WHEN 'K'.            rv_title = 'Credit Memo Request'.
      WHEN 'L'.            rv_title = 'Debit Memo Request'.
      WHEN 'J'.            rv_title = 'Part Delivery'.
      WHEN 'T' OR 'h'.     rv_title = 'Returns Delivery'.
      WHEN 'R' OR 'Q'.     rv_title = 'Goods Issue'.
      WHEN 'M'.            rv_title = 'Invoice Part'.
      WHEN 'N'.            rv_title = 'Invoice Cancellation'.
      WHEN 'O'.            rv_title = 'Credit Memo'.
      WHEN 'P'.            rv_title = 'Debit Memo'.
      WHEN 'U'.            rv_title = 'Pro Forma Invoice'.
      WHEN 'g' OR 'r' OR '+'. rv_title = 'Journal Entry'.
      WHEN OTHERS.         rv_title = 'Document'.
    ENDCASE.

  ENDMETHOD.

  METHOD has_child_in_lane.

    DATA: ls_link TYPE ty_link,
          ls_doc  TYPE ty_doc.

    LOOP AT mt_link INTO ls_link WHERE parent = iv_node.
      READ TABLE mt_docs INTO ls_doc WITH KEY node = ls_link-child.
      IF sy-subrc = 0 AND ls_doc-lane = iv_lane.
        rv_yes = abap_true.
        RETURN.
      ENDIF.
    ENDLOOP.

  ENDMETHOD.

  METHOD has_open_goods_issue.

    DATA: ls_link TYPE ty_link,
          ls_doc  TYPE ty_doc,
          ls_likp TYPE ty_likp.

    LOOP AT mt_link INTO ls_link WHERE parent = iv_node.

      READ TABLE mt_docs INTO ls_doc WITH KEY node = ls_link-child.
      IF sy-subrc <> 0 OR ls_doc-lane <> mc_lane-delivery.
        CONTINUE.
      ENDIF.

      READ TABLE mt_likp INTO ls_likp WITH KEY vbeln = ls_doc-vbeln.
      IF sy-subrc = 0 AND ls_likp-wbstk <> 'C'.
        rv_yes = abap_true.
        RETURN.
      ENDIF.

    ENDLOOP.

  ENDMETHOD.

  METHOD has_posted_invoice.

    DATA: lt_queue TYPE string_table,
          lt_seen  TYPE string_table,
          ls_link  TYPE ty_link,
          ls_doc   TYPE ty_doc,
          ls_vbrk  TYPE ty_vbrk,
          lv_node  TYPE string,
          lv_idx   TYPE i.

    APPEND iv_node TO lt_queue.
    APPEND iv_node TO lt_seen.

    " Breadth-first melalui MT_LINK: order -> delivery -> invoice
    " maupun order -> invoice (penagihan langsung dari order).
    WHILE lv_idx < lines( lt_queue ).

      lv_idx = lv_idx + 1.
      READ TABLE lt_queue INTO lv_node INDEX lv_idx.
      IF sy-subrc <> 0.
        EXIT.
      ENDIF.

      LOOP AT mt_link INTO ls_link WHERE parent = lv_node.

        IF line_exists( lt_seen[ table_line = ls_link-child ] ).
          CONTINUE.
        ENDIF.
        APPEND ls_link-child TO lt_seen.

        READ TABLE mt_docs INTO ls_doc WITH KEY node = ls_link-child.
        IF sy-subrc <> 0.
          CONTINUE.
        ENDIF.

        " Cabang retur pelanggan (nota kredit retur) bukan penagihan order asal.
        IF ls_doc-lane = mc_lane-customer_return.
          CONTINUE.
        ENDIF.

        IF ls_doc-lane = mc_lane-invoicing.
          READ TABLE mt_vbrk INTO ls_vbrk WITH KEY vbeln = ls_doc-vbeln.
          " Pro forma ('U') dan faktur yang dibatalkan tidak dihitung sebagai penagihan.
          IF sy-subrc = 0
             AND ls_vbrk-fksto <> 'X'
             AND ( ls_doc-vbtyp = 'M' OR ls_doc-vbtyp = 'O' OR ls_doc-vbtyp = 'P' ).
            rv_yes = abap_true.
            RETURN.
          ENDIF.
        ENDIF.

        APPEND ls_link-child TO lt_queue.

      ENDLOOP.

    ENDWHILE.

  ENDMETHOD.

  METHOD billing_block_of.

    DATA: ls_doc  TYPE ty_doc,
          ls_rel  TYPE ty_doc,
          ls_link TYPE ty_link,
          ls_vbak TYPE ty_vbak,
          ls_vbap TYPE ty_vbap,
          ls_likp TYPE ty_likp.

    READ TABLE mt_docs INTO ls_doc WITH KEY node = iv_node.
    IF sy-subrc <> 0.
      RETURN.
    ENDIF.

    CASE ls_doc-lane.

      WHEN mc_lane-inquiry OR mc_lane-quotation OR mc_lane-order
        OR mc_lane-customer_return.

        READ TABLE mt_vbak INTO ls_vbak WITH KEY vbeln = ls_doc-vbeln.
        IF sy-subrc = 0 AND ls_vbak-faksk IS NOT INITIAL.
          rv_faksk = ls_vbak-faksk.
          RETURN.
        ENDIF.

        " Blok faktur level item (VBAP-FAKSP).
        READ TABLE mt_vbap INTO ls_vbap WITH KEY vbeln = ls_doc-vbeln.
        IF sy-subrc = 0 AND ls_vbap-faksp IS NOT INITIAL.
          rv_faksk = ls_vbap-faksp.
          RETURN.
        ENDIF.

        " Blok faktur juga dapat berada pada dokumen pengiriman turunannya.
        LOOP AT mt_link INTO ls_link WHERE parent = iv_node.
          READ TABLE mt_docs INTO ls_rel WITH KEY node = ls_link-child.
          IF sy-subrc <> 0 OR ls_rel-lane <> mc_lane-delivery.
            CONTINUE.
          ENDIF.
          READ TABLE mt_likp INTO ls_likp WITH KEY vbeln = ls_rel-vbeln.
          IF sy-subrc = 0 AND ls_likp-faksk IS NOT INITIAL.
            rv_faksk = ls_likp-faksk.
            RETURN.
          ENDIF.
        ENDLOOP.

      WHEN mc_lane-delivery.

        READ TABLE mt_likp INTO ls_likp WITH KEY vbeln = ls_doc-vbeln.
        IF sy-subrc = 0 AND ls_likp-faksk IS NOT INITIAL.
          rv_faksk = ls_likp-faksk.
          RETURN.
        ENDIF.

        " Fallback: blok faktur pada order pendahulunya (header lalu item).
        LOOP AT mt_link INTO ls_link WHERE child = iv_node.
          READ TABLE mt_docs INTO ls_rel WITH KEY node = ls_link-parent.
          IF sy-subrc <> 0 OR ls_rel-lane <> mc_lane-order.
            CONTINUE.
          ENDIF.
          READ TABLE mt_vbak INTO ls_vbak WITH KEY vbeln = ls_rel-vbeln.
          IF sy-subrc = 0 AND ls_vbak-faksk IS NOT INITIAL.
            rv_faksk = ls_vbak-faksk.
            RETURN.
          ENDIF.
          READ TABLE mt_vbap INTO ls_vbap WITH KEY vbeln = ls_rel-vbeln.
          IF sy-subrc = 0 AND ls_vbap-faksp IS NOT INITIAL.
            rv_faksk = ls_vbap-faksp.
            RETURN.
          ENDIF.
        ENDLOOP.

    ENDCASE.

  ENDMETHOD.

  METHOD has_invoicing_issue.

    DATA: ls_doc  TYPE ty_doc,
          ls_vbak TYPE ty_vbak,
          ls_likp TYPE ty_likp.

    " 1. Pemblokiran faktur eksplisit (header atau item).
    IF billing_block_of( iv_node ) IS NOT INITIAL.
      rv_yes = abap_true.
      RETURN.
    ENDIF.

    READ TABLE mt_docs INTO ls_doc WITH KEY node = iv_node.
    IF sy-subrc <> 0.
      RETURN.
    ENDIF.

    " 2. Penagihan tertunggak: barang sudah keluar gudang / order sudah
    "    terkirim penuh, tetapi dokumen faktur belum pernah dibuat.
    "    Standar F2577 menandai node Planned Invoice dengan silang merah
    "    'Invoicing Issue' pada kondisi ini (ring lane Invoicing MERAH).
    CASE ls_doc-lane.

      WHEN mc_lane-delivery.
        READ TABLE mt_likp INTO ls_likp WITH KEY vbeln = ls_doc-vbeln.
        IF sy-subrc = 0 AND ls_likp-wbstk = 'C'.
          rv_yes = abap_true.
        ENDIF.

      WHEN mc_lane-order OR mc_lane-customer_return.
        READ TABLE mt_vbak INTO ls_vbak WITH KEY vbeln = ls_doc-vbeln.
        IF sy-subrc = 0 AND ls_vbak-lfstk = 'C'.
          rv_yes = abap_true.
        ENDIF.

    ENDCASE.

  ENDMETHOD.

  METHOD folded_info_of.

    DATA: ls_folded TYPE ty_folded,
          lt_part   TYPE string_table.

    LOOP AT mt_folded INTO ls_folded WHERE parent = iv_node.
      APPEND |{ ls_folded-title } { ls_folded-node }| TO lt_part.
    ENDLOOP.

    IF lt_part IS INITIAL.
      RETURN.
    ENDIF.

    SORT lt_part.
    DELETE ADJACENT DUPLICATES FROM lt_part.

    rv_text = |Includes { concat_lines_of( table = lt_part sep = ', ' ) }|.

  ENDMETHOD.

  METHOD to_external.

    DATA lv_num TYPE c LENGTH 30.

    lv_num = iv_number.
    CONDENSE lv_num.
    IF lv_num IS INITIAL.
      RETURN.
    ENDIF.

    rv_ext = |{ lv_num ALPHA = OUT }|.
    CONDENSE rv_ext.

  ENDMETHOD.

  METHOD fmt_date.

    IF iv_date IS INITIAL.
      rv_text = '-'.
      RETURN.
    ENDIF.

    rv_text = |{ iv_date DATE = USER }|.

  ENDMETHOD.

  METHOD fmt_amount.

    IF iv_currency IS INITIAL.
      rv_text = |{ iv_amount NUMBER = USER }|.
    ELSE.
      rv_text = |{ iv_amount CURRENCY = iv_currency NUMBER = USER }|.
    ENDIF.

    CONDENSE rv_text.

  ENDMETHOD.

ENDCLASS.
