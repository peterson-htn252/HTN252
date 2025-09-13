from authlib.integrations.flask_client import OAuth
import os
from dotenv import load_dotenv

load_dotenv()

CLIENT_SECRET = os.getenv("AWS_CLIENT_SECRET", "<client secret>")

oauth = OAuth()

def init_app(app):
    oauth.init_app(app)
    oauth.register(
        name='oidc',
        authority='https://cognito-idp.us-east-2.amazonaws.com/us-east-2_Y3j8IBnuE',
        client_id='387ub3kl6t8ljnharhnbfrum1h',
        client_secret=CLIENT_SECRET,
        server_metadata_url='https://cognito-idp.us-east-2.amazonaws.com/us-east-2_Y3j8IBnuE/.well-known/openid-configuration',
        client_kwargs={'scope': 'email openid phone'}
    )