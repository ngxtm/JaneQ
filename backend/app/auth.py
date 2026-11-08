from secrets import compare_digest
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response, Security, status
from fastapi.security import APIKeyCookie
from pydantic import BaseModel

router = APIRouter(prefix="/api/auth", tags=["authentication"])
SESSION_COOKIE_NAME = "janeq_session"
session_cookie = APIKeyCookie(
    name=SESSION_COOKIE_NAME,
    scheme_name="SessionCookie",
    description="Signed session cookie set by POST /api/auth/login.",
    auto_error=False,
)


class LoginRequest(BaseModel):
    username: str
    password: str


class User(BaseModel):
    username: str


class AuthError(BaseModel):
    detail: str


SESSION_REQUIRED_RESPONSES = {
    status.HTTP_401_UNAUTHORIZED: {
        "model": AuthError,
        "description": "The session cookie is missing, invalid, or expired.",
    }
}


def require_user(
    request: Request, cookie: Annotated[str | None, Security(session_cookie)]
) -> User:
    username = request.app.state.demo_username
    # SessionMiddleware verifies the signature before exposing the session payload.
    if cookie is None or request.session.get("username") != username:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sign in first.")
    return User(username=username)


@router.post(
    "/login",
    responses={
        status.HTTP_401_UNAUTHORIZED: {
            "model": AuthError,
            "description": "The username or password is incorrect.",
        }
    },
)
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
    # The signed cookie is readable, so keep the session payload to the username.
    request.session["username"] = username
    response.headers["Cache-Control"] = "no-store"
    return User(username=username)


@router.get("/me", responses=SESSION_REQUIRED_RESPONSES)
def me(user: Annotated[User, Depends(require_user)], response: Response) -> User:
    response.headers["Cache-Control"] = "no-store"
    return user


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(request: Request) -> Response:
    request.session.clear()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
