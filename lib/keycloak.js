import { Rate } from "k6/metrics";
import { uuidv4 } from "https://jslib.k6.io/k6-utils/1.0.0/index.js";
import http from 'k6/http';
import encoding from 'k6/encoding';
import { randomSeed } from 'k6';

/**
 * Maps environment variables to configuration items.
 */
const configEnvVars = {
  "KEYCLOAK_URL": {
    "name": "keycloakURL",
    "type": "string",
    "mandatory": true
  },
  "KEYCLOAK_OFFLINE_TOKENS": {
    "name": "offlineTokens",
    "type": "boolean",
    "mandatory": false,
    "default": false
  },
  "REALM_COUNT": {
    "name": "realmCount",
    "type": "int",
    "mandatory": true
  },
  "SESSION_COUNT": { 
    "name": "sessionCount",
    "type": "int",
    "mandatory": false,
    "default": 1000
  },
  "VU_COUNT": {
    "name": "vuCount",
    "type": "int",
    "mandatory": false,
    "default": 10
  },
  "TEST_DURATION": {
    "name": "testDuration",
    "type": "string",
    "mandatory": false,
    "default": "10m"
  },
  "RAMPUP_DURATION": {
    "name": "rampupDuration",
    "type": "string",
    "mandatory": false,
    "default": "30s"
  },
  "SETUP_TIMEOUT": {
    "name": "setupTimeout",
    "type": "string",
    "mandatory": false,
    "default": "1h"
  },
};

/**
 * Returns a config object filled with configuration from environment variables.
 * 
 * @throws {Error} Mandatory environment variable is not set
 * @returns {Object} Found configuration
 */
export function getTestConfig() {
  let config = {};
  for (const [env, params] of Object.entries(configEnvVars)) {
    let value;
    if (__ENV[env] != null && __ENV[env] != "") {
      if (params.type == "boolean") {
        value = __ENV[env] == "true" || __ENV[env] == "yes" || __ENV[env] == "1"
      } else if (params.type == "int") {
        value = parseInt(__ENV[env], 10);
      } else {
        value = __ENV[env];
      }
    } else {
      if (params.mandatory) {
        throw new Error(`Please set the ${env} environment variable`);
      }
      if (params.default != null) {
        value = params.default;
      }
    }
    config[params.name] = value;
  }

  if (__VU == 1) {
    console.log("Using the following config:")
    for (const [k,v] of Object.entries(config)) {
      console.log(`- ${k}: ${v}`);
    }
  }

  return config;
}

/**
 * Loads the realm matching the calling Virtual User.
 * The realm file must be in the "data" folder and realm files must follow
 * this naming: realm-XYZ.json (where XYZ is a zero padded integer).
 * 
 * Note that there can be more Virtual Users than realms but the opposite is not true.
 * @param {Number} realmCount The number of realm files in the "data" folder.
 * @returns {Oject} the Keycloak realm
 */
export function pickRealm(realmCount) {
    var realmId = __VU % realmCount;
    realmId = `${realmId}`.padStart(3, "0");
    var fileName = `data/realm-${realmId}.json`;
    return JSON.parse(open(fileName));
}

/**
 * Picks a random item in the supplied array.
 * 
 * @param {Array} list an array in which to choose from
 * @returns {Object} the random item
 */
export function pickRandom(list) {
    if (list == null ||list.length == 0) {
        return null;
    }

    var i = Math.floor(Math.random() * Math.floor(list.length));
    return list[i];
}

/**
 * Picks a random client in the supplied Keycloak realm.
 * 
 * @param {Object} realm the Keycloak realm
 * @returns {Object} the random client
 */
export function pickClient(realm) {
  return pickRandom(realm.clients);
}

/**
 * Picks a random user in the supplied Keycloak realm.
 * 
 * @param {Object} realm the Keycloak realm
 * @returns {Object} the random user
 */
export function pickUser(realm) {
  return pickRandom(realm.users);
}

/**
 * K6 "Rate" metric for counting Javascript errors during a test run.
 * 
 * @see {@link wrapWithErrorCounting}
 */
export var script_errors = Rate("script_errors");

/**
 * Wraps a K6 test function with error counting.
 * @see {@link script_errors}
 * 
 * @param {Function} fn The K6 test function to wrap
 * @returns {Function} The wrapped test function
 */
export function wrapWithErrorCounting(fn) {
  // result from the "setup" function is passed to the test function in "data"
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

/**
 * Builds a query string from an object containing keys & values.
 * 
 * @param {Object} data a key/value object
 * @returns {String} the encoded query string
 */
function buildQueryString(data) {
  const result = [];

  Object.keys(data)
   .forEach((key) => {
      const encode = encodeURIComponent;
      result.push(encode(key) + "=" + encode(data[key]));
  });

  return result.join("&");
}

/**
 * Represents a Keycloak client.
 */
export const Keycloak = class {

  /**
   * Creates a keycloak client from the server URL and params.
   * 
   * Currently accepted params:
   * - offlineTokens (boolean): request offline tokens instead of regular refresh tokens 
   * @param {String} keycloakURL the keycloak server URL
   * @param {Object} params a key/value object
   */
  constructor(keycloakURL, params) {
    this.keycloakURL = keycloakURL;
    this.params = Object.assign({ offlineTokens: false }, params);
  }
  
  /**
   * Returns OpenID Connect endpoints for a realm.
   * 
   * @param {Object} realm the Keycloak realm name
   * @returns {Object} the OIDC endpoints
   */
  endpoints(realm) {
    const BASE_URL = `${this.keycloakURL}/realms/${realm}`;
    return {
      "login": `${BASE_URL}/protocol/openid-connect/auth`,
      "token": `${BASE_URL}/protocol/openid-connect/token`,
      "userinfo": `${BASE_URL}/protocol/openid-connect/userinfo`,
      "tokeninfo": `${BASE_URL}/protocol/openid-connect/token/introspect`,
    }
  }
  
  /**
   * Simulates a user performing a login through a browser (OIDC Authorization Code flow).
   *  
   * @param {String} realm realm name
   * @param {Object} client the client to use for login
   * @param {Object} user the user to use for login
   * @param {Function} check the K6 check function (pass an empty function to disable checks)
   * @returns {Object} access and refresh tokens (as returned from the token endpoint)
   */
  login(realm, client, user, check) {
    let endpoints = this.endpoints(realm);
    const UI_HEADERS = {
      "Accept": "text/html,application/xhtml+xml,application/xml",
      "Accept-Encoding": "gzip, deflate",
      "Accept-Language": "en-US,en;q=0.5",
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.8; rv:16.0) Gecko/20100101 Firefox/16.0",
    };
  
    let scopes = [ "openid" ];
    if (this.params.offlineTokens) {
      scopes.push("offline_access");
    }
  
    const LOGIN_PARAMS = {
      "login": "true",
      "response_type": "code",
      "scope": scopes.join(" "),
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
    let access_token_response = http.post(endpoints.token, access_token_request, { "tags": { name: "access-token-request" } });
  
    check(access_token_response, {
      'access_token_response.status == 200': (http) => http.status === 200,
    });
  
    if (access_token_response.status !== 200) {
      throw new Error(`access_token_response.status is ${access_token_response.status}, expected 200`);
    }
  
    return access_token_response.json();
  }

  /**
   * Simulates a user performing a login through API (OIDC Resource Owner Password Credentials flow).
   *  
   * @param {String} realm realm name
   * @param {Object} client the client to use for login
   * @param {Object} user the user to use for login
   * @param {Function} check the K6 check function (pass an empty function to disable checks)
   * @returns {Object} access and refresh tokens (as returned from the token endpoint)
   */
  headlessLogin(realm, client, user, check) {
    let endpoints = this.endpoints(realm);
    let scopes = [ "openid" ];
    if (this.params.offlineTokens) {
      scopes.push("offline_access");
    }
  
    let access_token_request = {
      "grant_type": "password",
      "redirect_uri": client.redirectUris[0],
      "client_id": client.clientId,
      "client_secret": client.secret,
      "scope": scopes.join(" "),
      "username": user.username,
      "password": user.credentials[0].value,
    };
    let access_token_response = http.post(endpoints.token, access_token_request, { "tags": { name: "access-token-request" } });
    check(access_token_response, {
      'access_token_response.status == 200': (http) => http.status === 200,
    });
  
    if (access_token_response.status !== 200) {
      throw new Error(`access_token_response.status is ${access_token_response.status}, expected 200`);
    }
  
    return access_token_response.json();
  }
  
  /**
   * Refreshes the provided access and refresh tokens.
   *  
   * @param {String} realm realm name
   * @param {Object} tokens the result from the last call to the token endpoint
   * @param {Object} client the client to use for login
   * @param {Function} check the K6 check function (pass an empty function to disable checks)
   * @returns {Object} access and refresh tokens (as returned from the token endpoint)
   */
  refreshTokens(realm, tokens, client, check) {
    let endpoints = this.endpoints(realm);
    let access_token_request = {
      "grant_type": "refresh_token",
      "refresh_token": tokens.refresh_token,
      "client_id": client.clientId,
      "client_secret": client.secret
    };
    let access_token_response = http.post(endpoints.token, access_token_request, { "tags": { name: "refresh-tokens" } });
    check(access_token_response, {
      'access_token_response.status == 200': (http) => http.status === 200,
    });
  
    if (access_token_response.status !== 200) {
      throw new Error(`access_token_response.status is ${access_token_response.status}, expected 200`);
    }
  
    return access_token_response.json();
  }

  /**
   * Calls the tokeninfo endpoint.
   *  
   * @param {String} realm realm name
   * @param {Object} tokens the result from the last call to the token endpoint
   * @param {Object} client the client to use for login
   * @param {Function} check the K6 check function (pass an empty function to disable checks)
   * @returns {Object} the tokeninfo response (as-is)
   */
  tokeninfo(realm, tokens, client, check) {
    let endpoints = this.endpoints(realm);
    let body = {
      "token": tokens.access_token
    };
    let credentials = encoding.b64encode(`${client.clientId}:${client.secret}`);
    let tokeninfo = http.post(endpoints.tokeninfo, body, { "headers": { "Authorization": `Basic ${credentials}`}, "tags": { name: "tokeninfo" } });
    check(tokeninfo, {
      'tokeninfo.status == 200': (http) => http.status === 200,
    });
    return tokeninfo.json();
  }

  /**
   * Calls the tokeninfo endpoint.
   *  
   * @param {String} realm realm name
   * @param {Object} tokens the result from the last call to the token endpoint
   * @param {Object} client the client to use for login
   * @param {Function} check the K6 check function (pass an empty function to disable checks)
   * @returns {Object} the tokeninfo response (as-is)
   */
  userinfo(realm, tokens, check) {
    let endpoints = this.endpoints(realm);
    let userinfo = http.get(endpoints.userinfo, { "headers": { "Authorization": `Bearer ${tokens.access_token}`}, "tags": { name: "userinfo" } });
    check(userinfo, {
      'userinfo.status == 200': (http) => http.status === 200,
    });
    return userinfo.json();
  }
};

/**
 * Shuffles an array in-place.
 * 
 * @param {Array} array the array to shuffle.
 */
export function shuffleArray(array) {
  // https://stackoverflow.com/questions/2450954/how-to-randomize-shuffle-a-javascript-array
  for (var i = array.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var temp = array[i];
      array[i] = array[j];
      array[j] = temp;
  }
}

/**
 * Returns a K6 "setup" function that opens Keycloak sessions.
 * 
 * @param {Keycloak} keycloak the Keycloak client
 * @param {Number} realmCount the number of realm files in the "data" folder
 * @param {Number} sessionCount the number of Keycloak sessions to open
 * @returns {Function} the K6 setup function
 */
export function setupOpenSessions(keycloak, realmCount, sessionCount) {
  var realms = [];
  for (var i = 0; i < realmCount; i++) {
    let realmId = `${i}`.padStart(3, "0");
    let fileName = `data/realm-${realmId}.json`;
    realms.push(JSON.parse(open(fileName)));
  }
  return () => {
    let sessions = [];
    randomSeed(__VU);
    for (let i = 0; i < sessionCount; i++) {
      let session = {};
      const realm = pickRandom(realms);
      session.realm = {
        id: realm.id
      };
      let user = pickUser(realm);
      session.user = {
        username: user.username,
        credentials: [ { value: user.credentials[0].value } ],
      };
      let client = pickClient(realm);
      session.client = {
        clientId: client.clientId,
        secret: client.secret,
      };

      let tokens = keycloak.headlessLogin(realm.id, client, user, () => {});
      session.tokens = {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
      };

      if ((i+1) % 100 == 0) {
        console.log(`Opened ${i+1} Keycloak sessions so far...`);
      }

      sessions.push(session);
    }
    return sessions;
  };
}