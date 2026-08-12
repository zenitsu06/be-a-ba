from pydantic import BaseModel, Field


class LlmTesteRequest(BaseModel):
    prompt: str = Field(
        default="Responda apenas: camada de IA be-a-ba operacional.",
        min_length=3,
        max_length=1000,
    )

