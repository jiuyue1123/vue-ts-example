import axios, { AxiosError, AxiosResponse, CreateAxiosDefaults, InternalAxiosRequestConfig } from "axios";
import axiosRetry, { IAxiosRetryConfig } from 'axios-retry';
import { CustomAxiosRequestConfig, FlatRequestInstance, MappedType, RequestOption, ResponseType } from "./type";
import { stringify } from 'qs';
import { nanoid } from "nanoid";
import json5 from 'json5';

/**
 * Get proxy pattern of backend service base url
 *
 * @param key If not set, will use the default key
 */
function createProxyPattern(key?: App.Service.OtherBaseURLKey) {
    if (!key) {
        return '/proxy-default';
    }

    return `/proxy-${key}`;
}

/**
 * Create service config by current env
 *
 * @param env The current env
 */
export function createServiceConfig(env: Env.ImportMeta) {
    console.log(env);
    const { VITE_SERVICE_BASE_URL, VITE_OTHER_SERVICE_BASE_URL } = env;

    let other = {} as Record<App.Service.OtherBaseURLKey, string>;
    console.log(other);
    try {
        other = json5.parse(VITE_OTHER_SERVICE_BASE_URL);
    } catch (error) {
        console.error('VITE_OTHER_SERVICE_BASE_URL is not a valid json5 string', error);
    }

    const httpConfig: App.Service.SimpleServiceConfig = {
        baseURL: VITE_SERVICE_BASE_URL,
        other
    };

    const otherHttpKeys = Object.keys(httpConfig.other) as App.Service.OtherBaseURLKey[];

    const otherConfig: App.Service.OtherServiceConfigItem[] = otherHttpKeys.map(key => {
        return {
            key,
            baseURL: httpConfig.other[key],
            proxyPattern: createProxyPattern(key)
        };
    });

    const config: App.Service.ServiceConfig = {
        baseURL: httpConfig.baseURL,
        proxyPattern: createProxyPattern(),
        other: otherConfig
    };

    return config;
}

/**
 * get backend service base url
 *
 * @param env - the current env
 * @param isProxy - if use proxy
 */
export function getServiceBaseURL(env: Env.ImportMeta, isProxy: boolean) {
    const { baseURL, other } = createServiceConfig(env);

    const otherBaseURL = {} as Record<App.Service.OtherBaseURLKey, string>;

    other.forEach(item => {
        otherBaseURL[item.key] = isProxy ? item.proxyPattern : item.baseURL;
    });

    return {
        baseURL: isProxy ? createProxyPattern() : baseURL,
        otherBaseURL
    };
}
export function createDefaultOptions<ResponseData = any>(options?: Partial<RequestOption<ResponseData>>) {
    const opts: RequestOption<ResponseData> = {
        onRequest: async config => config,
        isBackendSuccess: _response => true,
        onBackendFail: async () => { },
        transformBackendResponse: async response => response.data,
        onError: async () => { }
    };

    Object.assign(opts, options);

    return opts;
}

export function createRetryOptions(config?: Partial<CreateAxiosDefaults>) {
    const retryConfig: IAxiosRetryConfig = {
        retries: 0
    };

    Object.assign(retryConfig, config);

    return retryConfig;
}

export function createAxiosConfig(config?: Partial<CreateAxiosDefaults>) {
    const TEN_SECONDS = 10 * 1000;

    const axiosConfig: CreateAxiosDefaults = {
        timeout: TEN_SECONDS,
        headers: {
            'Content-Type': 'application/json'
        },
        validateStatus: isHttpSuccess,
        paramsSerializer: params => {
            return stringify(params);
        }
    };

    Object.assign(axiosConfig, config);

    return axiosConfig;
}

/**
 * check if http status is success
 *
 * @param status
 */
export function isHttpSuccess(status: number) {
    const isSuccessCode = status >= 200 && status < 300;
    return isSuccessCode || status === 304;
}

/** request id key */
export const REQUEST_ID_KEY = 'X-Request-Id';
/** the backend error code key */
export const BACKEND_ERROR_CODE = 'BACKEND_ERROR';

function createCommonRequest<ResponseData = any>(
    axiosConfig?: CreateAxiosDefaults,
    options?: Partial<RequestOption<ResponseData>>
) {
    const opts = createDefaultOptions<ResponseData>(options);

    const axiosConf = createAxiosConfig(axiosConfig);
    const instance = axios.create(axiosConf);

    const abortControllerMap = new Map<string, AbortController>();

    // config axios retry
    const retryOptions = createRetryOptions(axiosConf);
    axiosRetry(instance, retryOptions);

    instance.interceptors.request.use(conf => {
        const config: InternalAxiosRequestConfig = { ...conf };

        // set request id
        const requestId = nanoid();
        config.headers.set(REQUEST_ID_KEY, requestId);

        // config abort controller
        if (!config.signal) {
            const abortController = new AbortController();
            config.signal = abortController.signal;
            abortControllerMap.set(requestId, abortController);
        }

        // handle config by hook
        const handledConfig = opts.onRequest?.(config) || config;

        return handledConfig;
    });

    instance.interceptors.response.use(
        async response => {
            const responseType: ResponseType = (response.config?.responseType as ResponseType) || 'json';

            if (responseType !== 'json' || opts.isBackendSuccess(response)) {
                return Promise.resolve(response);
            }

            const fail = await opts.onBackendFail(response, instance);
            if (fail) {
                return fail;
            }

            const backendError = new AxiosError<ResponseData>(
                'the backend request error',
                BACKEND_ERROR_CODE,
                response.config,
                response.request,
                response
            );

            await opts.onError(backendError);

            return Promise.reject(backendError);
        },
        async (error: AxiosError<ResponseData>) => {
            await opts.onError(error);

            return Promise.reject(error);
        }
    );

    function cancelRequest(requestId: string) {
        const abortController = abortControllerMap.get(requestId);
        if (abortController) {
            abortController.abort();
            abortControllerMap.delete(requestId);
        }
    }

    function cancelAllRequest() {
        abortControllerMap.forEach(abortController => {
            abortController.abort();
        });
        abortControllerMap.clear();
    }

    return {
        instance,
        opts,
        cancelRequest,
        cancelAllRequest
    };
}

export function createFlatRequest<ResponseData = any, State = Record<string, unknown>>(
    axiosConfig?: CreateAxiosDefaults,
    options?: Partial<RequestOption<ResponseData>>
) {
    const { instance, opts, cancelRequest, cancelAllRequest } = createCommonRequest<ResponseData>(axiosConfig, options);

    const flatRequest: FlatRequestInstance<State, ResponseData> = async function flatRequest<
        T = any,
        R extends ResponseType = 'json'
    >(config: CustomAxiosRequestConfig) {
        try {
            const response: AxiosResponse<ResponseData> = await instance(config);

            const responseType = response.config?.responseType || 'json';

            if (responseType === 'json') {
                const data = opts.transformBackendResponse(response);

                return { data, error: null };
            }

            return { data: response.data as MappedType<R, T>, error: null };
        } catch (error) {
            return { data: null, error };
        }
    } as FlatRequestInstance<State, ResponseData>;

    flatRequest.cancelRequest = cancelRequest;
    flatRequest.cancelAllRequest = cancelAllRequest;
    flatRequest.state = {} as State;

    return flatRequest;
}