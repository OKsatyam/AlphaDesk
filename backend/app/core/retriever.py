import time
from app.db.chroma import get_collection
from app.core.embedder import embed_query
from app.models.document import Chunk, Citation, Document
from app.config import settings


def retrieve_relevant_chunks(
    question: str,
    document_id: str = None,
    top_k: int = None,
    threshold: float = 0.42,
) -> list[Citation]:
    """
    Searches ChromaDB for the most relevant chunks
    for a given question.
    Returns a list of Citation objects.
    """

    top_k = top_k or settings.TOP_K_RESULTS
    collection = get_collection()

    # convert question to vector
    query_vector = embed_query(question)

    # build filter — if document_id given search only that doc
    # if None search across ALL documents
    where_filter = None
    if document_id:
        where_filter = {"document_id": document_id}

    # fetch extra candidates to survive dedup filtering
    fetch_k = top_k * 4

    # search ChromaDB for closest vectors
    results = collection.query(
        query_embeddings=[query_vector],
        n_results=fetch_k,
        where=where_filter,
        include=["documents", "metadatas", "distances"]
    )

    # results come back as nested lists — [0] gets first query results
    documents = results.get("documents", [[]])[0]
    metadatas = results.get("metadatas", [[]])[0]
    distances = results.get("distances", [[]])[0]

    # track kept chunk_indices per (doc_id, page_num) to skip overlapping chunks
    page_chunks_kept: dict[tuple, set] = {}
    citations = []

    for doc_text, metadata, distance in zip(documents, metadatas, distances):

        # chromadb returns distance not similarity
        # convert: similarity = 1 - distance
        relevance_score = round(1 - distance, 4)

        # threshold: filter clearly irrelevant chunks
        if relevance_score < threshold:
            continue

        doc_id = metadata.get("document_id", "")
        page_num = int(metadata.get("page_number", 0))
        chunk_idx = int(metadata.get("chunk_index", -1))
        key = (doc_id, page_num)

        kept = page_chunks_kept.get(key, set())
        # skip if an adjacent chunk (overlap window = 1) is already kept
        if any(abs(chunk_idx - k) <= 1 for k in kept):
            continue

        kept.add(chunk_idx)
        page_chunks_kept[key] = kept

        citations.append(Citation(
            chunk_id=metadata.get("chunk_id", ""),
            document_id=doc_id,
            page_number=page_num,
            section=metadata.get("section", "General"),
            relevance_score=relevance_score,
            text_snippet=doc_text[:500]
        ))

        if len(citations) >= top_k:
            break

    return citations


def store_chunks_in_chroma(
    chunks: list[Chunk],
    embeddings: list[list[float]],
    document: Document = None,
) -> None:
    """
    Stores chunks and their embeddings in ChromaDB.
    Called after embed_chunks() in the pipeline.

    ChromaDB needs 4 things for each chunk:
    - id         : unique identifier
    - embedding  : the vector
    - document   : the actual text
    - metadata   : page, section, document_id etc
    """

    collection = get_collection()

    if not chunks:
        print("No chunks to store")
        return

    ids = []
    embedding_list = []
    documents = []
    metadatas = []

    for chunk, embedding in zip(chunks, embeddings):
        ids.append(chunk.id)
        embedding_list.append(embedding)
        documents.append(chunk.text)

        # metadata is what we get back in citations
        # store everything we need for a good citation
        meta = {
            "chunk_id": chunk.id,
            "document_id": chunk.document_id,
            "page_number": chunk.page_number,
            "section": chunk.section,
            "chunk_index": chunk.chunk_index,
        }
        # also store document-level fields so list_documents + page viewer work
        if document:
            meta["filename"] = document.filename
            meta["company_name"] = document.company_name
            meta["filing_type"] = document.filing_type
            meta["market"] = document.market
        # TTL field — used by cleanup_old_chunks() to expire guest data
        meta["uploaded_at"] = time.time()
        metadatas.append(meta)

    # upsert = insert if new, update if already exists
    # safe to call multiple times on same document
    collection.upsert(
        ids=ids,
        embeddings=embedding_list,
        documents=documents,
        metadatas=metadatas
    )

    print(f"Stored {len(chunks)} chunks in ChromaDB")