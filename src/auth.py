from http.client import HTTPException
import os
from urllib.parse import urlencode, quote
from flask import Blueprint, session, url_for, redirect
from authlib.integrations.starlette_client import OAuthError
from oauth import oauth

REGION = "us-east-2"
USER_POOL_ID = "us-east-2_Y3j8IBnuE"
CLIENT_ID = "387ub3kl6t8ljnharhnbfrum1h"
CLIENT_SECRET = os.getenv("AWS_CLIENT_SECRET", "<client secret>")  # set in env
ISSUER = f"https://cognito-idp.{REGION}.amazonaws.com/{USER_POOL_ID}"
SERVER_METADATA_URL = f"{ISSUER}/.well-known/openid-configuration"
SCOPES = "openid email phone"
DOMAIN_PREFIX = "us-east-2y3j8ibnue"

api = Blueprint("/user", __name__, url_prefix="/user")

def hosted_ui_base() -> str:
    return f"https://{DOMAIN_PREFIX}.auth.{REGION}.amazoncognito.com"

@api.route('/')
def index():
    user = session.get('user')
    if user:
        return  f'Hello, {user["email"]}. <a href="/logout">Logout</a>'
    else:
        return f'Welcome! Please <a href="/login">Login</a>.'

@api.route('/authorize')
def authorize():
    token = oauth.oidc.authorize_access_token()
    user = token['userinfo']
    session['user'] = user
    return redirect("/")

@api.route("/login")
def login():
    # Must be in your Cognito App client callback list
    redirect_uri = url_for("/user.authorize", _external=True)
    return oauth.oidc.authorize_redirect(redirect_uri)

@api.route('/logout')
def logout():
    session.pop('user', None)
    return redirect('/')

@api.route("/signup")
def signup():
    redirect_uri = url_for("/user.login", _external=True)
    q = urlencode(
        {
            "client_id": CLIENT_ID,
            "response_type": "code",
            "scope": SCOPES,
            "redirect_uri": redirect_uri,
        },
        quote_via=quote,
    )
    return redirect(f"{hosted_ui_base()}/signup?{q}")

@api.get("/me")
def get_current_user():
    return {"valid": True, "data": "Get current user not implemented yet."} # TODO: Implement get current user logic with DynamoDB

@api.post("/update")
def update_user():
    return {"valid": True, "data": "User update not implemented yet."} # TODO: Implement user update logic with DynamoDB

@api.post("/get_data")
def get_user_data():
    return {"valid": True, "data": "Get user data not implemented yet."} # TODO: Implement get user data logic with DynamoDB
