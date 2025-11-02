export const X_LOGIN_REQUEST_TIME = 'x-login-request-time'
export const X_LOGIN_TOKEN = 'x-login-token'

const config = useRuntimeConfig()
export const headers = {
  authorization:
    'Basic ' + btoa(unescape(encodeURIComponent(config.DAV_USERNAME + ':' + config.DAV_PASSWORD))),
}
