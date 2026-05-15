from google import genai
from app.config import settings

client = genai.Client(api_key=settings.GEMINI_API_KEY)

print("Available models:")
for model in client.models.list():
    print(model.name)