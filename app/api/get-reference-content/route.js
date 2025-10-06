// app/api/get-reference-content/route.ts
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const documentId = Number(searchParams.get('documentId'))
    const page = Number(searchParams.get('page'))
    const pad = Number(searchParams.get('pad') || '2')
    const referenceDocId = searchParams.get('referenceDocId') // uuid (optional)

    if (!documentId || !page) {
      return NextResponse.json({ error: 'Missing documentId or page' }, { status: 400 })
    }

    const cookieStore = cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { get: (name: string) => cookieStore.get(name)?.value } }
    )

    // 1) Get all TOC ids for this document (scopes ref content to the same doc)
    const { data: tocRows, error: tocErr } = await supabase
      .from('toc')
      .select('id')
      .eq('document_id', documentId)

    if (tocErr) {
      return NextResponse.json({ error: `TOC fetch failed: ${tocErr.message}` }, { status: 500 })
    }

    const tocIds = (tocRows || []).map(r => r.id)
    if (tocIds.length === 0) {
      return NextResponse.json({ items: [], meta: { reason: 'no_toc_for_document' } })
    }

    const minPage = page - pad
    const maxPage = page + pad

    // 2) Primary query: reference_content rows linked via toc_id + page window
    let { data: refRows, error: refErr } = await supabase
      .from('reference_content')
      .select('id, toc_id, reference_doc_id, page_number, document_page, page_content, created_at')
      .in('toc_id', tocIds)
      .gte('page_number', minPage)
      .lte('page_number', maxPage)
      .order('page_number', { ascending: true })

    // Some rows may use document_page instead of page_number — widen with a second pass if needed
    if (!refErr && refRows && refRows.length === 0) {
      const alt = await supabase
        .from('reference_content')
        .select('id, toc_id, reference_doc_id, page_number, document_page, page_content, created_at')
        .in('toc_id', tocIds)
        .gte('document_page', minPage)
        .lte('document_page', maxPage)
        .order('document_page', { ascending: true })
      if (!alt.error && alt.data) refRows = alt.data
    }

    // 3) Optional fallback by reference_doc_id (if provided)
    if (referenceDocId && (!refRows || refRows.length === 0)) {
      const fb = await supabase
        .from('reference_content')
        .select('id, toc_id, reference_doc_id, page_number, document_page, page_content, created_at')
        .eq('reference_doc_id', referenceDocId)
        .or(`and(page_number.gte.${minPage},page_number.lte.${maxPage}),and(document_page.gte.${minPage},document_page.lte.${maxPage})`)
        .order('page_number', { ascending: true })
      if (!fb.error && fb.data) refRows = fb.data
    }

    return NextResponse.json({
      items: refRows ?? [],
      meta: { documentId, page, pad, count: refRows?.length ?? 0 }
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Unexpected error' }, { status: 500 })
  }
}
