from pydantic import BaseModel


class CustomerOut(BaseModel):
    id: str
    name: str
    customer_code: str

    model_config = {"from_attributes": True}
