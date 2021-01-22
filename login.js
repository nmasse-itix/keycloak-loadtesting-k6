import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { uuidv4 } from "https://jslib.k6.io/k6-utils/1.0.0/index.js";
import { pickRealm, pickClient, pickUser, wrapWithErrorCounting, buildQueryString } from "./lib/keycloak.js";
import { randomSeed } from 'k6';

export let options = {
  stages: [
    { duration: "20s", target: 5 },
    { duration: "1m", target: 100 }
  ],
  noVUConnectionReuse: true,
};

const realmCount = 10;
const realm = pickRealm(realmCount);
const realmId = realm.id;

randomSeed(__VU);

const BASE_URL = `http://hp-microserver.itix.fr/auth/realms/${realmId}`;
const LOGIN_ENDPOINT = `${BASE_URL}/protocol/openid-connect/auth`;
const TOKEN_ENDPOINT = `${BASE_URL}/protocol/openid-connect/token`;
const UI_HEADERS = {
  "Accept": "text/html,application/xhtml+xml,application/xml",
  "Accept-Encoding": "gzip, deflate",
  "Accept-Language": "en-US,en;q=0.5",
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.8; rv:16.0) Gecko/20100101 Firefox/16.0",
};

const LOGIN_PARAMS = {
  "login": "true",
  "response_type": "code",
};

function testKCLogin() {
  var user = pickUser(realm);
  var client = pickClient(realm);

  group('login', () => {
    let login_params = Object.assign(LOGIN_PARAMS, { "client_id": client.clientId, "state": uuidv4(), "redirect_uri": client.redirectUris[0] });
    let query_string = buildQueryString(login_params);
    let login_page = http.get(`${LOGIN_ENDPOINT}?${query_string}`, { "headers": UI_HEADERS, "tags": { name: "get-login-page" } });
    check(login_page, {
      'login_page.status == 200': (http) => http.status === 200,
    });

    if (login_page == null || login_page.status !== 200) {
      return;
    }

    let authorization_response = login_page.submitForm({
      formSelector: '#kc-form-login',
      fields: { username: user.username, password: user.credentials[0].value },
      params: { redirects: 0, "tags": { name: "authorization-request" } },
    });
  
    check(authorization_response, {
      'authorization_response.status == 302': (http) => http.status === 302, 
    });

    let location = authorization_response.headers["Location"];
    let re = /[&?]code=([^&]+)(&|$)/;
    let matches = [... location.matchAll(re) ];
    let code = matches[0][1];
    
    let access_token_request = { 
      "grant_type": "authorization_code",
      "code": code,
      "redirect_uri": client.redirectUris[0],
      "client_id": client.clientId,
      "client_secret": client.secret
    };
    let access_token_response = http.post(`${TOKEN_ENDPOINT}`, access_token_request, { "tags": { name: "access-token-request" } });

    check(access_token_response, {
      'access_token_response.status == 200': (http) => http.status === 200, 
    });
  });

  sleep(2);
}

export default wrapWithErrorCounting(testKCLogin);

