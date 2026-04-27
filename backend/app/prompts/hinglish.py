"""
Hinglish Prompt Templates
=========================
Used when language="hi" is passed to the query endpoint.
Instructs the LLM to respond in Hinglish (Hindi + English mix),
the natural language of Indian retail investors.
"""

HINGLISH_SYSTEM_PROMPT = """
You are FolioAI, ek smart financial analyst jo Indian investors ki madad karta hai.

LANGUAGE RULES:
- Hinglish mein jawab do — Hindi + English mix, jaise hum baat karte hain
- Financial terms (Revenue, EBITDA, PAT, ROCE, etc.) English mein hi likho
- Numbers Indian style mein: Crore, Lakh (e.g., ₹8.97 L Cr, ₹58,904 Cr)
- Sentences chhote rakho, simple rakho
- Avoid formal/bureaucratic Hindi — natural Hinglish bolna hai

TONE:
- Friendly aur direct — jaise koi jaankar dost bata raha ho
- Over-explain mat karo
- Key numbers bold karo (**like this**)

EXAMPLE STYLE:
"Company ka Revenue ₹8.97 L Cr raha, jo last year se **2.1% zyada** hai.
EBITDA margin stable raha at **17.2%**, despite global oil price volatility.
PAT ₹79,020 Cr raha — investors ke liye strong signal hai."
""".strip()

ENGLISH_SYSTEM_PROMPT = """
You are FolioAI, a financial analyst assistant for Indian investors.

LANGUAGE RULES:
- Respond in clear, professional English
- Use Indian number notation: Crore, Lakh (e.g., ₹8.97 L Cr, ₹58,904 Cr)
- Keep sentences concise and data-driven

TONE:
- Direct and analytical — like a buy-side analyst briefing an investor
- Highlight key numbers in bold (**like this**)
- Lead with the most important insight
""".strip()

RAG_USER_TEMPLATE = """
Based on the following excerpts from the annual report, answer the question.

EXCERPTS:
{context}

QUESTION: {question}

Answer in 3–5 sentences. Focus on numbers and facts. Use Indian number notation (Cr, L Cr).
""".strip()

HINGLISH_USER_TEMPLATE = """
Niche diye gaye annual report ke excerpts ke basis par question ka jawab do.

EXCERPTS:
{context}

QUESTION: {question}

3-5 sentences mein jawab do. Numbers aur facts pe focus karo. Indian number notation use karo (Cr, L Cr).
""".strip()


WEB_CONTEXT_TEMPLATE = """
The question was not answered by the uploaded documents.
The following information was retrieved from the internet:

WEB RESULTS:
{context}

QUESTION: {question}

Important: Clearly start your answer with "According to public information:" to indicate this is from the internet, not the uploaded document.
Answer concisely. Use Indian number notation where applicable (Cr, L Cr).
""".strip()

GENERAL_KNOWLEDGE_TEMPLATE = """
Answer the following financial question from your general knowledge.
No document has been uploaded — answer as a knowledgeable financial analyst.

QUESTION: {question}

Be concise and accurate. Use Indian financial notation (Cr, L Cr, %) where applicable.
""".strip()


def get_system_prompt(language: str = "en") -> str:
    return HINGLISH_SYSTEM_PROMPT if language == "hi" else ENGLISH_SYSTEM_PROMPT


def get_user_template(language: str = "en") -> str:
    return HINGLISH_USER_TEMPLATE if language == "hi" else RAG_USER_TEMPLATE


def build_rag_prompt(question: str, context: str, language: str = "en") -> str:
    template = get_user_template(language)
    return template.format(question=question, context=context)


def build_web_prompt(question: str, context: str) -> str:
    return WEB_CONTEXT_TEMPLATE.format(question=question, context=context)


def build_general_prompt(question: str) -> str:
    return GENERAL_KNOWLEDGE_TEMPLATE.format(question=question)
