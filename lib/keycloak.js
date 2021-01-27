import { Rate } from "k6/metrics";
import { uuidv4 } from "https://jslib.k6.io/k6-utils/1.0.0/index.js";
import http from 'k6/http';

export function pickRealm(realmCount) {
    var realmId = __VU % realmCount;
    realmId = `${realmId}`.padStart(3, "0");
    var fileName = `data/realm-${realmId}.json`;
    return JSON.parse(open(fileName));
}

export function pickClient(realm) {
    var clients = realm.clients;
    if (clients == null || clients.length == 0) {
        return null;
    }

    var i = Math.floor(Math.random() * Math.floor(clients.length));
    return clients[i];
}

export function pickUser(realm) {
    var users = realm.users;
    if (users == null || users.length == 0) {
        return null;
    }

    var i = Math.floor(Math.random() * Math.floor(users.length));
    return users[i];
}

export var script_errors = Rate("script_errors");
export function wrapWithErrorCounting(fn) {
  return (data) => {
    try {
      fn(data);
      script_errors.add(0);
    } catch (e) {
      script_errors.add(1);
      throw e;
    }
  }
}

export function buildQueryString(data) {
  const result = [];

  Object.keys(data)
   .forEach((key) => {
      const encode = encodeURIComponent;
      result.push(encode(key) + "=" + encode(data[key]));
  });

  return result.join("&");
}

export function keycloakEndpoints(keycloakUrl, realmId) {
  const BASE_URL = `${keycloakUrl}/realms/${realmId}`;
  return {
    "login": `${BASE_URL}/protocol/openid-connect/auth`,
    "token": `${BASE_URL}/protocol/openid-connect/token`,
    "userinfo": `${BASE_URL}/protocol/openid-connect/userinfo`,
  }
}

export function keycloakLogin(endpoints, client, user, check) {
  const UI_HEADERS = {
    "Accept": "text/html,application/xhtml+xml,application/xml",
    "Accept-Encoding": "gzip, deflate",
    "Accept-Language": "en-US,en;q=0.5",
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.8; rv:16.0) Gecko/20100101 Firefox/16.0",
  };

  const LOGIN_PARAMS = {
    "login": "true",
    "response_type": "code",
    "scope": "openid",
  };

  let login_params = Object.assign(LOGIN_PARAMS, { "client_id": client.clientId, "state": uuidv4(), "redirect_uri": client.redirectUris[0] });
  let query_string = buildQueryString(login_params);
  let login_page = http.get(`${endpoints.login}?${query_string}`, { "headers": UI_HEADERS, "tags": { name: "get-login-page" } });
  check(login_page, {
    'login_page.status == 200': (http) => http.status === 200,
  });

  if (login_page.status !== 200) {
    throw new Error(`login_page.status is ${login_page.status}, expected 200`);
  }

  let authorization_response = login_page.submitForm({
    formSelector: '#kc-form-login',
    fields: { username: user.username, password: user.credentials[0].value },
    params: { redirects: 0, "tags": { name: "authorization-request" } },
  });

  check(authorization_response, {
    'authorization_response.status == 302': (http) => http.status === 302,
  });

  if (authorization_response.status !== 302) {
    throw new Error(`authorization_response.status is ${authorization_response.status}, expected 302`);
  }

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
  let access_token_response = http.post(`${endpoints.token}`, access_token_request, { "tags": { name: "access-token-request" } });

  check(access_token_response, {
    'access_token_response.status == 200': (http) => http.status === 200,
  });

  if (access_token_response.status !== 200) {
    throw new Error(`access_token_response.status is ${access_token_response.status}, expected 200`);
  }

  return access_token_response.json();
}

export function keycloakRefreshTokens(endpoints, tokens, client, check) {
  let access_token_request = {
    "grant_type": "refresh_token",
    "refresh_token": tokens.refresh_token,
    "client_id": client.clientId,
    "client_secret": client.secret
  };
  let access_token_response = http.post(`${endpoints.token}`, access_token_request, { "tags": { name: "refresh-tokens" } });

  check(access_token_response, {
    'access_token_response.status == 200': (http) => http.status === 200,
  });

  if (access_token_response.status !== 200) {
    throw new Error(`access_token_response.status is ${access_token_response.status}, expected 200`);
  }

  return access_token_response.json();
}