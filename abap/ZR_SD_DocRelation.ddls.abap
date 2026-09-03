*"----------------------------------------------------------------------
*" CDS Custom Entity : ZR_SD_DocRelation
*" Purpose           : Node + relasi alur dokumen SD untuk sap.suite.ui.commons.ProcessFlow
*" Implemented by    : ZCL_SD_DOCFLOW_QUERY (if_rap_query_provider)
*" Exposed as        : DocRelations  (service definition ZSD_SD_DOCFLOW)
*"
*" CATATAN PENTING (BREAKING CHANGE vs versi lama):
*"  1. DocNumber diubah dari `vbeln` (char10) menjadi abap.char(30).
*"     Wajib, karena node phantom memakai key sintetis: PLDEL_2110000165,
*"     PLINV_0080000123, PLJE_0090000456 yang tidak muat di char10.
*"  2. Field baru: PrecedingDocs, LaneKey, SortOrder, GoodsIssueDate,
*"     BillingDate, PostingDate, ReferenceDoc.
*"  3. Status sekarang memakai nama state UI5 secara langsung
*"     (Positive / Critical / Negative / Neutral / Planned / PlannedNegative).
*"     Nilai legacy 'Warning' dan 'Error' tetap diterima frontend.
*"
*" Setelah mengubah definisi ini WAJIB: Activate (Ctrl+F3) -> buka Service
*" Binding ZUI_SD_DOCFLOW -> tombol "Publish" ulang, lalu bersihkan cache
*" metadata (lihat DEPLOYMENT_AND_LIFECYCLE_GUIDE.md).
*"----------------------------------------------------------------------

@EndUserText.label: 'SD Document Flow Nodes & Relations (Custom Query)'
@ObjectModel.query.implementedBy: 'ABAP:ZCL_SD_DOCFLOW_QUERY'
define root custom entity ZR_SD_DocRelation
{
      // ---- Key --------------------------------------------------------
  key AnchorSalesDocument : vbeln;              // Dokumen yang diklik user (anchor). WAJIB difilter.
  key DocNumber           : abap.char( 30 );    // Nomor dokumen node ATAU key phantom (PLDEL_/PLINV_/PLJE_)

      // ---- Identitas node --------------------------------------------
      DocCategory         : abap.char( 4 );     // VBTYP: A B C G H I J T M O P U, 'g' = Journal Entry
      DocTitle            : abap.char( 60 );    // 'Sales Order', 'Outbound Delivery', 'Planned Invoice', ...
      LaneKey             : abap.char( 20 );    // lane_inquiry|lane_quotation|lane_order|lane_delivery|lane_invoicing|lane_customer_return|lane_accounting
      NodeType            : abap.char( 12 );    // 'Single' | 'Planned'
      SortOrder           : abap.int4;          // Urutan render (lane * 1000 + urutan dalam lane)

      // ---- Status ----------------------------------------------------
      Status              : abap.char( 20 );    // Positive|Critical|Negative|Neutral|Planned|PlannedNegative
      StatusText          : abap.char( 60 );    // 'Shipped', 'No Journal Entry', 'Not Cleared', ...

      // ---- Dua baris teks kontekstual pada kartu node ----------------
      ExtraLine1          : abap.char( 80 );    // 'Requested Delivery On 12.03.2026'
      ExtraLine2          : abap.char( 80 );    // 'Completely Invoiced' / 'Net Value 1.500,00 IDR'

      // ---- Relasi ----------------------------------------------------
      SubsequentDocs      : abap.string;        // 'node_0080000123,node_0090000456'  (WAJIB prefiks node_, tanpa spasi)
      PrecedingDocs       : abap.string;        // kebalikan SubsequentDocs, dipakai frontend untuk auto-wiring

      // ---- Atribut dokumen (popover detail) --------------------------
      CreatedOnDate       : abap.dats;
      CreatedBy           : ernam;
      RequestedDelivDate  : abap.dats;
      GoodsIssueDate      : abap.dats;
      BillingDate         : abap.dats;
      PostingDate         : abap.dats;
      ReferenceDoc        : abap.char( 30 );    // dok. pembatal / dok. pelunasan / material doc GI
      AdditionalInfo      : abap.string;        // teks bebas untuk popover

      Currency            : waers;

      @Semantics.amount.currencyCode: 'Currency'
      NetValue            : abap.curr( 15, 2 );
}
