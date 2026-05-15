from sentence_transformers import SentenceTransformer
from app.models.document import Chunk
from app.config import settings
import numpy as np


# ===================================
# Embedding model — loaded once
# kept in memory for speed
# ===================================

# This variable holds our loaded model
# We load it once when the app starts
# loading it every time would be very slow (5-10 seconds each time)
_embedding_model = None


def get_embedding_model() -> SentenceTransformer:
    """
    Returns the embedding model.
    Loads it only once (singleton pattern).

    First call  → downloads + loads model (~50MB, takes 10-20 seconds)
    Every call after → returns instantly from memory
    """
    global _embedding_model

    if _embedding_model is None:
        print(f"Loading embedding model: {settings.EMBEDDING_MODEL}")
        print("First load takes 10-20 seconds — downloading model...")

        _embedding_model = SentenceTransformer(settings.EMBEDDING_MODEL)

        print("Embedding model loaded and ready!")

    return _embedding_model


def embed_text(text: str) -> list[float]:
    """
    Converts a single piece of text into a vector.

    Used for:
    - Embedding user questions at query time
    - Quick single text embedding

    Returns a list of 384 floats
    Example: [0.23, 0.87, 0.12, 0.56, ...]
    """
    model = get_embedding_model()

    # encode returns a numpy array
    # tolist() converts it to a plain Python list
    # which is what ChromaDB expects
    embedding = model.encode(text, show_progress_bar=False)

    return embedding.tolist()


def embed_chunks(chunks: list[Chunk]) -> tuple[list[Chunk], list[list[float]]]:
    """
    Converts a list of chunks into vectors in one batch.

    Why batch? Because embedding one by one is slow.
    Batch embedding lets the model process everything
    in parallel — much faster on both CPU and GPU.

    Returns:
    - Same list of chunks (unchanged)
    - List of embeddings (one vector per chunk)

    The index matches — chunks[0] pairs with embeddings[0]
    """
    model = get_embedding_model()

    if not chunks:
        return [], []

    # extract just the text from each chunk
    texts = [chunk.text for chunk in chunks]

    print(f"Embedding {len(texts)} chunks...")

    # batch encode all texts at once
    # show_progress_bar=True shows a nice progress bar in terminal
    embeddings = model.encode(
        texts,
        show_progress_bar=True,
        batch_size=32,       # process 32 chunks at a time
        normalize_embeddings=True  # normalize for cosine similarity
    )

    # convert numpy arrays to Python lists
    embeddings_list = [emb.tolist() for emb in embeddings]

    print(f"Done — embedded {len(chunks)} chunks")

    return chunks, embeddings_list


def embed_query(question: str) -> list[float]:
    """
    Converts a user's question into a vector.

    This is called at query time — when a user asks
    a question we embed it and search ChromaDB for
    the closest matching chunk vectors.

    Separate function from embed_text to make the
    pipeline code more readable and clear.
    """
    model = get_embedding_model()

    # normalize_embeddings=True is important —
    # must match how we embedded the chunks
    # otherwise similarity scores will be wrong
    embedding = model.encode(
        question,
        normalize_embeddings=True,
        show_progress_bar=False
    )

    return embedding.tolist()