from pydantic import BaseModel


class LoginRequest(BaseModel):
    username: str
    password: str


class UserOut(BaseModel):
    id: str
    username: str
    display_name: str
    role: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in_minutes: int
    user: UserOut


class DemoUserOut(BaseModel):
    """
    Public, non-sensitive listing of the seeded demo accounts so the login
    page can offer one-click "Log in as <role>" buttons. SIMULATION MODE:
    these are synthetic demo credentials, not real secrets — this endpoint
    would never exist in a production identity system.
    """

    username: str
    password: str
    display_name: str
    role: str
    role_label: str
    description: str
