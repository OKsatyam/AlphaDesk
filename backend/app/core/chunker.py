from app.models.document import Chunk
from app.config import settings
import uuid
import re


# ===================================
# Financial boundary markers
# We prefer to split at these points
# rather than mid-sentence
# ===================================
SPLIT_MARKERS = [
    "\n\n",          # paragraph break — best split point
    "\n",            # line break — second choice
    ". ",            # sentence end — third choice
    ", ",            # clause end — last resort
]


def count_words(text: str) -> int:
    """
    Counts words in a piece of text.
    Simple but effective for chunk size estimation.
    """
    return len(text.split())


def split_into_sentences(text: str) -> list[str]:
    """
    Splits text into sentences using punctuation.
    Handles common financial abbreviations like
    'Rs.', 'U.S.', 'Ltd.' so we don't split on those.
    """
    # protect common abbreviations from being split
    text = re.sub(r'(Rs|U\.S|Ltd|Dr|Mr|Mrs|St|vs|etc)\.',
                  r'\1<DOT>', text)

    # split on sentence endings
    sentences = re.split(r'(?<=[.!?])\s+', text)

    # restore protected dots
    sentences = [s.replace('<DOT>', '.') for s in sentences]

    return [s.strip() for s in sentences if s.strip()]


def create_chunks_from_text(
    text: str,
    document_id: str,
    page_number: int,
    section: str,
    start_chunk_index: int = 0,
    chunk_size: int = None,
    chunk_overlap: int = None
) -> list[Chunk]:
    """
    Takes a single piece of text (usually one page)
    and splits it into multiple smaller chunks.

    chunk_size    = max words per chunk (default from config: 512)
    chunk_overlap = words to repeat between chunks (default: 50)

    Returns a list of Chunk objects ready to be embedded.
    """

    # use config defaults if not specified
    chunk_size = chunk_size or settings.CHUNK_SIZE
    chunk_overlap = chunk_overlap or settings.CHUNK_OVERLAP

    # if text is already small enough — return as single chunk
    if count_words(text) <= chunk_size:
        return [Chunk(
            id=str(uuid.uuid4()),
            document_id=document_id,
            text=text.strip(),
            page_number=page_number,
            section=section,
            chunk_index=start_chunk_index
        )]

    # split into sentences first
    sentences = split_into_sentences(text)

    chunks = []
    current_chunk_words = []
    current_word_count = 0
    chunk_index = start_chunk_index

    for sentence in sentences:
        sentence_words = sentence.split()
        sentence_word_count = len(sentence_words)

        # if adding this sentence exceeds chunk_size
        # save current chunk and start a new one
        if current_word_count + sentence_word_count > chunk_size:

            # only save if we have meaningful content
            if current_chunk_words:
                chunk_text = " ".join(current_chunk_words).strip()

                if len(chunk_text) > 50:  # skip tiny chunks
                    chunks.append(Chunk(
                        id=str(uuid.uuid4()),
                        document_id=document_id,
                        text=chunk_text,
                        page_number=page_number,
                        section=section,
                        chunk_index=chunk_index
                    ))
                    chunk_index += 1

                # overlap — keep last N words for next chunk
                # so context is not lost at boundaries
                overlap_words = current_chunk_words[-chunk_overlap:]
                current_chunk_words = overlap_words + sentence_words
                current_word_count = len(current_chunk_words)
            else:
                # sentence itself is longer than chunk_size
                # just add it as its own chunk
                current_chunk_words = sentence_words
                current_word_count = sentence_word_count
        else:
            # sentence fits — add to current chunk
            current_chunk_words.extend(sentence_words)
            current_word_count += sentence_word_count

    # save the last remaining chunk
    if current_chunk_words:
        chunk_text = " ".join(current_chunk_words).strip()
        if len(chunk_text) > 50:
            chunks.append(Chunk(
                id=str(uuid.uuid4()),
                document_id=document_id,
                text=chunk_text,
                page_number=page_number,
                section=section,
                chunk_index=chunk_index
            ))

    return chunks


def chunk_document(
    page_chunks: list[Chunk],
) -> list[Chunk]:
    """
    Master function — takes the raw page chunks
    from parser.py and returns properly sized chunks
    ready for embedding.

    This is what the pipeline.py will call.

    page_chunks  = list of Chunk objects from parser.py
                   (one chunk per page, possibly very long)

    Returns      = list of properly sized Chunk objects
                   (each 200-500 words, with overlap)
    """

    final_chunks = []
    global_chunk_index = 0

    print(f"Chunking {len(page_chunks)} pages...")

    for page_chunk in page_chunks:

        # split this page's text into smaller chunks
        sub_chunks = create_chunks_from_text(
            text=page_chunk.text,
            document_id=page_chunk.document_id,
            page_number=page_chunk.page_number,
            section=page_chunk.section,
            start_chunk_index=global_chunk_index
        )

        final_chunks.extend(sub_chunks)
        global_chunk_index += len(sub_chunks)

    print(f"Done: {len(page_chunks)} pages -> {len(final_chunks)} chunks")

    return final_chunks