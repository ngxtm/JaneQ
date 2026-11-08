from secrets import compare_digest

from fastapi import APIRouter, HTTPException, Request, Response, status
from pydantic import BaseModel

router = APIRouter(prefix="/api/auth", tags=["authentication"])


class LoginRequest(BaseModel):
    username: str
    password: str


class User(BaseModel):
    username: str


def require_user(request: Request) -> User:
    username = request.app.state.demo_username
    if request.session.get("username") != username:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sign in first.")
    return User(username=username)


@router.post("/login")
def login(credentials: LoginRequest, request: Request, response: Response) -> User:
    username = request.app.state.demo_username
    username_matches = compare_digest(credentials.username.encode(), username.encode())
    password_matches = compare_digest(
        credentials.password.encode(), request.app.state.demo_password.encode()
    )
    if not (username_matches and password_matches):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect username or password."
        )

    request.session.clear()
    request.session["username"] = username
    response.headers["Cache-Control"] = "no-store"
    return User(username=username)


@router.get("/me")
def me(request: Request, response: Response) -> User:
    user = require_user(request)
    response.headers["Cache-Control"] = "no-store"
    return user


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(request: Request) -> Response:
    request.session.clear()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
