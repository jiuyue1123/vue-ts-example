import { request } from '../request';

/**
 * Login
 *
 * @param userName User name
 * @param password Password
 */
export function fetchLogin() {
  return request<Api.Auth.LoginVO>({
    url: '/auth/login',
    method: 'post',
  });
}