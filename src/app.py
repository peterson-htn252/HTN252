from flask import Flask
from polygon import RESTClient
from dotenv import load_dotenv
import os
from auth import api
from flasgger import APISpec, Schema, Swagger, fields
from auth import index, login, logout, authorize, signup
from apispec.ext.marshmallow import MarshmallowPlugin
from apispec_webframeworks.flask import FlaskPlugin
import oauth
from datetime import datetime, timedelta

load_dotenv()

SESSION_SECRET=os.getenv("SESSION_SECRET", "<session secret>")
app = Flask(__name__)
app.register_blueprint(api)
app.config.update(
    SECRET_KEY=SESSION_SECRET,
    SESSION_COOKIE_SAMESITE="Lax",      # good default for OAuth code flow
    SESSION_COOKIE_SECURE=False,        # True in HTTPS/prod
)

oauth.init_app(app)

spec = APISpec(
    title='Flasger Petstore',
    version='1.0.10',
    openapi_version='2.0',
    plugins=[
        FlaskPlugin(),
        MarshmallowPlugin(),
    ],
)

template = spec.to_flasgger(
    app,
    paths=[""]
)

swag = Swagger(app, template=template)


if __name__ == '__main__':
    app.run(host="0.0.0.0", port=8000, debug=True)