import chromadb
from chromadb.config import Settings as ChromaSettings
from app.config import settings
from loguru import logger


# ===================================
# ChromaDB client — single instance
# for the entire app
# ===================================

# This variable holds our one ChromaDB connection
# We create it once and reuse it everywhere
_chroma_client = None
_collection = None


def get_chroma_client():
    """
    Returns the ChromaDB client.
    Creates it only once (singleton pattern).
    """
    global _chroma_client

    if _chroma_client is None:
        try:
            _chroma_client = chromadb.PersistentClient(
                path=settings.CHROMA_DB_PATH,
                settings=ChromaSettings(anonymized_telemetry=False)
            )
        except Exception as e:
            # Corrupted DB on disk — wipe and recreate clean
            import shutil, os
            logger.warning(f"ChromaDB load failed ({e}), resetting database")
            if os.path.exists(settings.CHROMA_DB_PATH):
                shutil.rmtree(settings.CHROMA_DB_PATH)
            _chroma_client = chromadb.PersistentClient(
                path=settings.CHROMA_DB_PATH,
                settings=ChromaSettings(anonymized_telemetry=False)
            )

    return _chroma_client


def get_collection():
    """
    Returns our main document collection.
    A collection is like a table in a regular database —
    it holds all our document chunks and their vectors.
    """
    global _collection

    if _collection is None:
        client = get_chroma_client()

        # get_or_create means:
        # - if collection exists already → use it
        # - if it doesn't exist yet → create it fresh
        _collection = client.get_or_create_collection(
            name=settings.CHROMA_COLLECTION_NAME,

            # cosine similarity = measures angle between vectors
            # best choice for text similarity search
            metadata={"hnsw:space": "cosine"}
        )

    return _collection


def get_collection_stats():
    """
    Returns basic info about what's stored in ChromaDB.
    Useful for debugging — how many chunks do we have?
    """
    collection = get_collection()
    count = collection.count()

    return {
        "collection_name": settings.CHROMA_COLLECTION_NAME,
        "total_chunks": count,
        "db_path": settings.CHROMA_DB_PATH
    }


def delete_document_chunks(document_id: str):
    """
    Deletes all chunks belonging to one document.
    Used when a user removes a document from AlphaDesk.
    """
    collection = get_collection()

    # where filter — only delete chunks where
    # document_id matches the one we want to remove
    collection.delete(
        where={"document_id": document_id}
    )


def cleanup_old_chunks(max_age_hours: int = 24) -> int:
    """
    Deletes all chunks whose uploaded_at timestamp is older than max_age_hours.

    Guest sessions are not tracked — this acts as a global TTL for any
    document that has an uploaded_at field. Documents without the field
    (ingested before this feature) are left untouched.

    Returns the number of document_ids that were cleaned up.
    """
    import time

    collection = get_collection()
    cutoff = time.time() - (max_age_hours * 3600)

    # fetch chunks older than cutoff — only those with uploaded_at set
    result = collection.get(
        where={"uploaded_at": {"$lt": cutoff}},
        include=["metadatas"],
    )

    chunk_ids = result.get("ids", [])
    metadatas = result.get("metadatas", [])

    if not chunk_ids:
        logger.info(f"Cleanup: no chunks older than {max_age_hours}h found")
        return 0

    # collect unique document_ids for logging
    doc_ids = {m.get("document_id") for m in metadatas if m.get("document_id")}

    collection.delete(ids=chunk_ids)

    logger.info(
        f"Cleanup: removed {len(chunk_ids)} chunks "
        f"from {len(doc_ids)} documents older than {max_age_hours}h"
    )
    return len(doc_ids)
