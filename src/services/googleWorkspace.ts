import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  User,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';
import {
  MaterialRow,
  EksekusiMimsRow,
  MaterialStatus,
  YantekRealisasiReport,
  HvbRealisasiReport,
  YantekDatabaseSegment,
  TrafoManagementRecord,
} from '../types/warehouse';
import { DEFAULT_TEKNIK_SINJAI_DATA } from '../data/teknikSinjaiDatabase';

export const SCOPES = [
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/spreadsheets.readonly',
];

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);

const provider = new GoogleAuthProvider();
SCOPES.forEach((scope) => provider.addScope(scope));
provider.setCustomParameters({
  prompt: 'select_account',
});

// Flag to indicate if we are in the middle of a sign-in flow.
let isSigningIn = false;
let cachedAccessToken: string | null = null;
let cachedTokenExpiresAt = 0;
let cachedFallbackUser: User | null = null;
const authSuccessListeners = new Set<(user: User, token: string) => void>();
const authFailureListeners = new Set<() => void>();

export function hasValidCachedAccessToken(): boolean {
  return Boolean(cachedAccessToken && Date.now() < cachedTokenExpiresAt);
}

function syncSessionToServer(accessToken: string, user: User | null, expiresAtMs?: number) {
  const expiresAt = expiresAtMs || Date.now() + 55 * 60 * 1000;
  const payload = {
    accessToken,
    expiresAt,
    user: user
      ? {
          uid: user.uid,
          email: user.email,
          displayName: user.displayName,
          photoURL: user.photoURL,
        }
      : null,
  };
  fetch('/api/auth/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch(() => {});
}

async function fetchSessionFromServer(): Promise<{
  accessToken: string;
  expiresAt: number;
  user: User | null;
} | null> {
  try {
    const res = await fetch('/api/auth/session');
    const rawText = await res.text();
    const trimmed = rawText.trim();
    if (!res.ok || !trimmed || trimmed.startsWith('<')) {
      return null;
    }
    const data = JSON.parse(trimmed);
    if (data?.active && data?.session?.accessToken) {
      return {
        accessToken: String(data.session.accessToken),
        expiresAt: Number(data.session.expiresAt) || Date.now() + 50 * 60 * 1000,
        user: (data.session.user as User) || null,
      };
    }
  } catch {
    // Ignore network error
  }
  return null;
}

function saveOAuthSessionToStorage(accessToken: string, user: User | null) {
  cachedAccessToken = accessToken;
  cachedTokenExpiresAt = Date.now() + 55 * 60 * 1000;
  const resolvedUser =
    user ||
    cachedFallbackUser ||
    ({
      uid: 'google-oauth-user',
      email: 'Terhubung via Google OAuth',
      displayName: 'Petugas Google Workspace',
      photoURL: null,
    } as User);
  cachedFallbackUser = resolvedUser;
  syncSessionToServer(accessToken, resolvedUser, cachedTokenExpiresAt);
  authSuccessListeners.forEach((cb) => {
    try {
      cb(resolvedUser, accessToken);
    } catch {
      // Ignore listener error
    }
  });
}

export function clearOAuthSessionFromStorage() {
  cachedAccessToken = null;
  cachedTokenExpiresAt = 0;
  cachedFallbackUser = null;
  fetch('/api/auth/session', { method: 'DELETE' }).catch(() => {});
  authFailureListeners.forEach((cb) => {
    try {
      cb();
    } catch {
      // Ignore listener error
    }
  });
}

declare global {
  interface Window {
    google?: {
      accounts?: {
        oauth2?: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            prompt?: string;
            ux_mode?: 'popup' | 'redirect';
            callback: (response: {
              access_token?: string;
              error?: string;
              error_description?: string;
            }) => void;
            error_callback?: (err: { type?: string; message?: string }) => void;
          }) => {
            requestAccessToken: (overrideConfig?: { prompt?: string }) => void;
          };
        };
      };
    };
  }
}

export const FIREBASE_PROJECT_ID = firebaseConfig.projectId || 'gen-lang-client-0123226455';
export const DEFAULT_OAUTH_CLIENT_ID = firebaseConfig.oAuthClientId || '';
export const OAUTH_CLIENT_ID = DEFAULT_OAUTH_CLIENT_ID;
const CUSTOM_OAUTH_CLIENT_STORAGE_KEY = 'sinjai_custom_oauth_client_id_v1';

export function getActiveOAuthClientId(): string {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const saved = window.localStorage.getItem(CUSTOM_OAUTH_CLIENT_STORAGE_KEY)?.trim();
      if (saved && saved.endsWith('.apps.googleusercontent.com')) {
        return saved;
      }
    }
  } catch {
    // Ignore storage read error
  }
  const envClientId =
    typeof import.meta !== 'undefined'
      ? String((import.meta as any).env?.VITE_GOOGLE_OAUTH_CLIENT_ID || '').trim()
      : '';
  if (envClientId) return envClientId;
  return DEFAULT_OAUTH_CLIENT_ID;
}

export function hasCustomOAuthClientId(): boolean {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return Boolean(window.localStorage.getItem(CUSTOM_OAUTH_CLIENT_STORAGE_KEY)?.trim());
    }
  } catch {
    // Ignore storage error
  }
  return false;
}

export function setCustomOAuthClientId(clientId: string): void {
  const cleaned = clientId.trim();
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      if (!cleaned) {
        window.localStorage.removeItem(CUSTOM_OAUTH_CLIENT_STORAGE_KEY);
      } else {
        window.localStorage.setItem(CUSTOM_OAUTH_CLIENT_STORAGE_KEY, cleaned);
      }
    }
  } catch {
    // Ignore storage write error
  }
}

export const FIREBASE_AUTH_DOMAINS_URL = `https://console.firebase.google.com/project/${FIREBASE_PROJECT_ID}/authentication/settings`;
export const GCP_OAUTH_CLIENTS_URL = `https://console.cloud.google.com/apis/credentials?project=${FIREBASE_PROJECT_ID}`;
export const GCP_OAUTH_CONSENT_AUDIENCE_URL = `https://console.cloud.google.com/auth/audience?project=${FIREBASE_PROJECT_ID}`;

export interface BrowserEnvironmentInfo {
  isMobile: boolean;
  isAndroid: boolean;
  isIOS: boolean;
  isStandalonePwa: boolean;
  isInAppBrowser: boolean;
  inAppName: string | null;
  currentOrigin: string;
  currentHostname: string;
  chromeIntentUrl: string | null;
}

export function detectBrowserEnvironment(): BrowserEnvironmentInfo {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return {
      isMobile: false,
      isAndroid: false,
      isIOS: false,
      isStandalonePwa: false,
      isInAppBrowser: false,
      inAppName: null,
      currentOrigin: '',
      currentHostname: '',
      chromeIntentUrl: null,
    };
  }

  const ua = navigator.userAgent || '';
  const isAndroid = /Android/i.test(ua);
  const isIOS = /iPhone|iPad|iPod/i.test(ua);
  const isMobile = isAndroid || isIOS || /webOS|BlackBerry|IEMobile|Opera Mini/i.test(ua);
  const isStandalonePwa =
    (typeof window.matchMedia === 'function' &&
      window.matchMedia('(display-mode: standalone)').matches) ||
    Boolean((navigator as any).standalone);

  let inAppName: string | null = null;
  if (/WhatsApp/i.test(ua)) inAppName = 'WhatsApp';
  else if (/Telegram/i.test(ua)) inAppName = 'Telegram';
  else if (/Instagram/i.test(ua)) inAppName = 'Instagram';
  else if (/FBAN|FBAV|FB_IAB/i.test(ua)) inAppName = 'Facebook';
  else if (/Line\//i.test(ua)) inAppName = 'LINE';
  else if (/BytedanceWebview|TikTok|Musical_ly/i.test(ua)) inAppName = 'TikTok';
  else if (/GSA\//i.test(ua)) inAppName = 'Google App (WebView)';
  else if (/Twitter|LinkedInApp|MicroMessenger/i.test(ua)) {
    inAppName = 'Browser Dalam Aplikasi';
  } else if (/\bwv\b|; wv\)/i.test(ua)) {
    inAppName = 'Browser Dalam Aplikasi (WebView)';
  } else if (isIOS && !isStandalonePwa && !/Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS/i.test(ua)) {
    inAppName = 'Browser Dalam Aplikasi (iOS WebView)';
  }

  const currentOrigin = window.location.origin || '';
  const currentHostname = window.location.hostname || '';
  const chromeIntentUrl =
    isAndroid && window.location.host
      ? `intent://${window.location.host}${window.location.pathname}${window.location.search}#Intent;scheme=https;package=com.android.chrome;end`
      : null;

  return {
    isMobile,
    isAndroid,
    isIOS,
    isStandalonePwa,
    isInAppBrowser: Boolean(inAppName),
    inAppName,
    currentOrigin,
    currentHostname,
    chromeIntentUrl,
  };
}

export async function refreshServerOAuthSession(): Promise<{
  user: User;
  accessToken: string;
} | null> {
  const serverSess = await fetchSessionFromServer();
  if (!serverSess?.accessToken) {
    return null;
  }
  cachedAccessToken = serverSess.accessToken;
  cachedTokenExpiresAt = serverSess.expiresAt;
  const resolvedUser =
    serverSess.user ||
    cachedFallbackUser ||
    ({
      uid: 'google-oauth-user',
      email: 'Terhubung via Sesi Admin',
      displayName: 'Petugas Google Workspace',
      photoURL: null,
    } as User);
  cachedFallbackUser = resolvedUser;
  authSuccessListeners.forEach((cb) => {
    try {
      cb(resolvedUser, serverSess.accessToken);
    } catch {
      // Ignore listener error
    }
  });
  return { user: resolvedUser, accessToken: serverSess.accessToken };
}

function buildOAuthPolicyError(rawDetail?: string): Error {
  const env = detectBrowserEnvironment();
  if (env.isInAppBrowser) {
    const err: any = new Error(
      `Browser ${env.inAppName || 'WebView'} memblokir login Google (Error 403: disallowed_useragent / kebijakan OAuth 2.0 Google). Silakan ketuk "Buka di Google Chrome" atau salin link aplikasi lalu buka di Chrome/Safari.`
    );
    err.code = 'oauth/disallowed-webview';
    err.currentOrigin = env.currentOrigin;
    err.currentDomain = env.currentHostname;
    return err;
  }

  const activeClientId = getActiveOAuthClientId();
  const detailText = rawDetail ? ` (${rawDetail})` : '';
  const err: any = new Error(
    `Akses diblokir kebijakan OAuth 2.0 Google${detailText}. Pastikan Origin "${env.currentOrigin || env.currentHostname}" terdaftar pada Authorized JavaScript origins Client ID (${activeClientId}) & Firebase Authorized domains, atau gunakan OAuth Client ID dari project GCP Anda sendiri (mis. logistiksinjai).`
  );
  err.code = 'oauth/policy-blocked';
  err.currentOrigin = env.currentOrigin;
  err.currentDomain = env.currentHostname;
  err.firebaseAuthUrl = FIREBASE_AUTH_DOMAINS_URL;
  return err;
}

async function fetchGoogleUserProfile(accessToken: string): Promise<User> {
  try {
    const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (res.ok) {
      const profile = await res.json().catch(() => ({}));
      return {
        uid: profile.sub || 'google-oauth-user',
        email: profile.email || 'user@gmail.com',
        displayName: profile.name || profile.email || 'Petugas Google Workspace',
        photoURL: profile.picture || null,
      } as User;
    }
  } catch {
    // Ignore profile fetch error and use default user metadata
  }
  return {
    uid: 'google-oauth-user',
    email: 'Terhubung via Google OAuth',
    displayName: 'Petugas Google Workspace',
    photoURL: null,
  } as User;
}

export const signInWithGoogleIdentityServices = (
  promptMode: string = 'select_account'
): Promise<{
  user: User;
  accessToken: string;
}> => {
  return new Promise((resolve, reject) => {
    const env = detectBrowserEnvironment();
    if (env.isInAppBrowser) {
      reject(buildOAuthPolicyError('disallowed_useragent'));
      return;
    }

    const oauth2 = window.google?.accounts?.oauth2;
    const clientId = getActiveOAuthClientId();

    if (!oauth2 || !clientId) {
      reject(
        new Error(
          'Layanan Google Identity Services masih dimuat atau OAuth Client ID belum tersedia. Pastikan koneksi internet aktif lalu coba ketuk tombol sekali lagi.'
        )
      );
      return;
    }

    const scopeList = [
      ...SCOPES,
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile',
    ].join(' ');

    const tokenClient = oauth2.initTokenClient({
      client_id: clientId,
      scope: scopeList,
      prompt: promptMode,
      ux_mode: 'popup',
      callback: async (response) => {
        if (response.error || !response.access_token) {
          const errStr = String(response.error_description || response.error || '');
          if (/popup_closed|access_denied_by_user/i.test(errStr)) {
            reject(new Error('auth/popup-closed-by-user'));
            return;
          }
          reject(buildOAuthPolicyError(errStr || 'OAuth callback error'));
          return;
        }
        cachedAccessToken = response.access_token;
        const user = await fetchGoogleUserProfile(response.access_token);
        cachedFallbackUser = user;
        saveOAuthSessionToStorage(response.access_token, user);
        resolve({ user, accessToken: response.access_token });
      },
      error_callback: (err) => {
        const errType = String(err?.type || '');
        const errMsg = String(err?.message || '');
        if (errType === 'popup_closed') {
          reject(new Error('auth/popup-closed-by-user'));
          return;
        }
        if (errType === 'popup_failed_to_open') {
          reject(
            new Error(
              'Jendela login Google diblokir oleh browser mobile. Izinkan pop-up pada browser Chrome/Safari atau buka langsung di browser Chrome/Safari.'
            )
          );
          return;
        }
        reject(buildOAuthPolicyError(errMsg || errType || 'OAuth 2.0 error'));
      },
    });

    tokenClient.requestAccessToken({ prompt: promptMode });
  });
};

export const setManualGoogleAccessToken = async (
  rawToken: string
): Promise<{ user: User; accessToken: string }> => {
  const cleaned = rawToken.trim().replace(/^Bearer\s+/i, '');
  if (!cleaned) {
    throw new Error('Access Token Google tidak boleh kosong.');
  }
  // Verify token by listing 1 file from Drive or reading userinfo
  const testRes = await fetch('https://www.googleapis.com/drive/v3/files?pageSize=1', {
    headers: { Authorization: `Bearer ${cleaned}` },
  });
  if (!testRes.ok) {
    throw new Error(
      'Access Token tidak valid atau belum memiliki izin Google Drive / Google Sheets.'
    );
  }
  cachedAccessToken = cleaned;
  const user = await fetchGoogleUserProfile(cleaned);
  cachedFallbackUser = user;
  saveOAuthSessionToStorage(cleaned, user);
  return { user, accessToken: cleaned };
};

export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  if (onAuthSuccess) authSuccessListeners.add(onAuthSuccess);
  if (onAuthFailure) authFailureListeners.add(onAuthFailure);

  // Check server session immediately so mobile/shared devices restore active Google session
  fetchSessionFromServer().then((serverSess) => {
    if (serverSess?.accessToken && !hasValidCachedAccessToken()) {
      cachedAccessToken = serverSess.accessToken;
      cachedTokenExpiresAt = serverSess.expiresAt;
      const resolvedUser =
        serverSess.user ||
        cachedFallbackUser ||
        ({
          uid: 'google-oauth-user',
          email: 'Terhubung via Google OAuth',
          displayName: 'Petugas Google Workspace',
          photoURL: null,
        } as User);
      cachedFallbackUser = resolvedUser;
      if (onAuthSuccess) onAuthSuccess(resolvedUser, cachedAccessToken);
    }
  });

  const unsubscribeFirebase = onAuthStateChanged(auth, async (user: User | null) => {
    if (!hasValidCachedAccessToken()) {
      const serverSess = await fetchSessionFromServer();
      if (serverSess?.accessToken) {
        cachedAccessToken = serverSess.accessToken;
        cachedTokenExpiresAt = serverSess.expiresAt;
        cachedFallbackUser =
          serverSess.user ||
          cachedFallbackUser ||
          ({
            uid: 'google-oauth-user',
            email: 'Terhubung via Google OAuth',
            displayName: 'Petugas Google Workspace',
            photoURL: null,
          } as User);
      }
    }

    if (user) {
      if (hasValidCachedAccessToken() && cachedAccessToken) {
        saveOAuthSessionToStorage(cachedAccessToken, user);
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
      } else if (!isSigningIn) {
        cachedAccessToken = null;
        cachedTokenExpiresAt = 0;
        if (onAuthFailure) onAuthFailure();
      }
    } else if (cachedFallbackUser && hasValidCachedAccessToken() && cachedAccessToken) {
      if (onAuthSuccess) onAuthSuccess(cachedFallbackUser, cachedAccessToken);
    } else {
      cachedAccessToken = null;
      cachedTokenExpiresAt = 0;
      if (onAuthFailure) onAuthFailure();
    }
  });

  return () => {
    if (onAuthSuccess) authSuccessListeners.delete(onAuthSuccess);
    if (onAuthFailure) authFailureListeners.delete(onAuthFailure);
    unsubscribeFirebase();
  };
};

export const googleSignIn = async (): Promise<{
  user: User;
  accessToken: string;
} | null> => {
  const env = detectBrowserEnvironment();

  if (env.isInAppBrowser) {
    const existingServerSession = await refreshServerOAuthSession();
    if (existingServerSession) {
      return existingServerSession;
    }
    throw buildOAuthPolicyError('disallowed_useragent');
  }

  // If a custom OAuth Client ID was explicitly configured (e.g. from user's own GCP project / Netlify),
  // use GIS directly with that Client ID so mobile & desktop share the user's configured OAuth Client.
  if (hasCustomOAuthClientId() || (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_GOOGLE_OAUTH_CLIENT_ID)) {
    try {
      isSigningIn = true;
      return await signInWithGoogleIdentityServices('select_account');
    } catch (gisErr: any) {
      if (String(gisErr?.message || '').includes('popup-closed-by-user')) {
        return null;
      }
      throw gisErr;
    } finally {
      isSigningIn = false;
    }
  }

  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Gagal mendapatkan access token Google Workspace dari Firebase Auth.');
    }

    saveOAuthSessionToStorage(credential.accessToken, result.user);
    return { user: result.user, accessToken: credential.accessToken };
  } catch (error: any) {
    console.warn('Firebase signInWithPopup fallback check:', error?.code || error?.message);
    const errCode = String(error?.code || '');
    const errMsg = String(error?.message || '');

    // 1. Check if server or memory already has an active Google OAuth session
    const existingServerSession = await refreshServerOAuthSession();
    if (existingServerSession) {
      return existingServerSession;
    }

    // 2. Fallback to Google Identity Services (GIS) OAuth2 Token Client on popup/domain issues
    if (
      errCode === 'auth/unauthorized-domain' ||
      errMsg.includes('auth/unauthorized-domain') ||
      errCode === 'auth/operation-not-supported-in-this-environment' ||
      errCode === 'auth/popup-blocked' ||
      errCode === 'auth/popup-closed-by-user' ||
      errCode === 'auth/cancelled-popup-request'
    ) {
      if (
        errCode === 'auth/popup-closed-by-user' ||
        errCode === 'auth/cancelled-popup-request' ||
        errMsg.includes('popup-closed-by-user')
      ) {
        return null;
      }
      try {
        const gisResult = await signInWithGoogleIdentityServices('select_account');
        return gisResult;
      } catch (gisErr: any) {
        if (String(gisErr?.message || '').includes('popup-closed-by-user')) {
          return null;
        }
        throw gisErr?.code ? gisErr : buildOAuthPolicyError(errCode || errMsg);
      }
    }

    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const getAccessToken = async (): Promise<string | null> => {
  if (hasValidCachedAccessToken() && cachedAccessToken) {
    return cachedAccessToken;
  }
  const serverSess = await fetchSessionFromServer();
  if (serverSess?.accessToken) {
    cachedAccessToken = serverSess.accessToken;
    cachedTokenExpiresAt = serverSess.expiresAt;
    if (!cachedFallbackUser) {
      cachedFallbackUser =
        serverSess.user ||
        ({
          uid: 'google-oauth-user',
          email: 'Terhubung via Google OAuth',
          displayName: 'Petugas Google Workspace',
          photoURL: null,
        } as User);
    }
    return cachedAccessToken;
  }
  cachedAccessToken = null;
  cachedTokenExpiresAt = 0;
  return null;
};

export const logoutGoogle = async (): Promise<void> => {
  await auth.signOut().catch(() => {});
  clearOAuthSessionFromStorage();
};

export interface DriveSpreadsheetFile {
  id: string;
  name: string;
  modifiedTime?: string;
  webViewLink?: string;
}

export interface SheetTabInfo {
  sheetId: number;
  title: string;
  rowCount?: number;
  columnCount?: number;
}

export interface SpreadsheetMetadata {
  spreadsheetId: string;
  title: string;
  spreadsheetUrl: string;
  sheets: SheetTabInfo[];
}

export function quoteSheetTab(tabTitle: string): string {
  const safeTitle = String(tabTitle || 'Sheet1').replace(/'/g, "''");
  return `'${safeTitle}'`;
}

export function quoteSheetRange(tabTitle: string, rangeRef: string): string {
  const safeTitle = String(tabTitle || 'Sheet1').replace(/'/g, "''");
  return `'${safeTitle}'!${rangeRef}`;
}

async function sheetsFetchWithRetry(
  url: string,
  init?: RequestInit,
  maxRetries = 3
): Promise<Response> {
  let attempt = 0;
  while (true) {
    const res = await fetch(url, init);
    if (res.status !== 429 && res.status !== 503) {
      return res;
    }
    if (attempt >= maxRetries) {
      return res;
    }
    const delayMs = 2500 * Math.pow(1.8, attempt) + Math.floor(Math.random() * 600);
    attempt++;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
}

async function extractGoogleApiError(res: Response, fallbackMsg: string): Promise<string> {
  const errData = await res.json().catch(() => ({}));
  const rawMsg = errData?.error?.message;
  if (res.status === 401) {
    clearOAuthSessionFromStorage();
    return 'Sesi login Google Anda telah berakhir (401). Silakan klik tombol Login Google / Kirim Ulang untuk memperbarui otorisasi.';
  }
  if (res.status === 403) {
    return (
      rawMsg ||
      'Akses ditolak (403). Pastikan akun Google Anda memiliki izin Edit (Editor) pada Google Spreadsheet tujuan.'
    );
  }
  if (res.status === 429 || (rawMsg && String(rawMsg).includes('Quota exceeded'))) {
    return 'Batas kuota pembacaan Google Sheets per menit tercapai (429). Sistem telah mengoptimalkan antrean request—silakan tunggu 15–30 detik lalu klik tombol Kirim / Sinkronkan lagi.';
  }
  return rawMsg || `${fallbackMsg} (${res.status})`;
}

export function extractSpreadsheetId(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return '';
  const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (match && match[1]) {
    return match[1];
  }
  if (/^[a-zA-Z0-9-_]{20,}$/.test(trimmed)) {
    return trimmed;
  }
  return '';
}

export function normalizeSpreadsheetName(name: string): string {
  return String(name || '')
    .toUpperCase()
    .replace(/[_\s-]+/g, ' ')
    .trim();
}

export function isTeknikSpreadsheetTitle(title: string): boolean {
  const norm = normalizeSpreadsheetName(title);
  return (
    (norm.includes('TEKNIK') || norm.includes('YANTEK') || norm.includes('HVB')) &&
    !norm.includes('LOGISTIK')
  );
}

export function isLogistikSpreadsheetTitle(title: string): boolean {
  const norm = normalizeSpreadsheetName(title);
  return norm.includes('LOGISTIK') && !norm.includes('TEKNIK');
}

export function findAllLogistikSinjaiSpreadsheets(
  files: DriveSpreadsheetFile[]
): DriveSpreadsheetFile[] {
  const candidates = files.filter((f) => !isTeknikSpreadsheetTitle(f.name));
  const exactSpace = candidates.filter(
    (f) => String(f.name || '').trim().toUpperCase() === 'LOGISTIK SINJAI'
  );
  const exactNormalized = candidates.filter(
    (f) =>
      normalizeSpreadsheetName(f.name) === 'LOGISTIK SINJAI' &&
      String(f.name || '').trim().toUpperCase() !== 'LOGISTIK SINJAI'
  );
  const partialMatches = candidates.filter((f) => {
    const n = normalizeSpreadsheetName(f.name);
    return (
      n !== 'LOGISTIK SINJAI' &&
      (n.includes('LOGISTIK SINJAI') ||
        n.includes('SINJAI BENDERANG') ||
        n.includes('LOGISTIK EHAO') ||
        n.includes('LOGISTIK'))
    );
  });

  const combined = [...exactSpace, ...exactNormalized, ...partialMatches];
  const seen = new Set<string>();
  return combined.filter((f) => {
    if (!f?.id || seen.has(f.id)) return false;
    seen.add(f.id);
    return true;
  });
}

export function findLogistikSinjaiSpreadsheet(
  files: DriveSpreadsheetFile[]
): DriveSpreadsheetFile | undefined {
  return findAllLogistikSinjaiSpreadsheets(files)[0];
}

export function findAllTeknikSinjaiSpreadsheets(
  files: DriveSpreadsheetFile[]
): DriveSpreadsheetFile[] {
  const candidates = files.filter((f) => !isLogistikSpreadsheetTitle(f.name));
  const exactSpace = candidates.filter(
    (f) => String(f.name || '').trim().toUpperCase() === 'TEKNIK SINJAI'
  );
  const exactNormalized = candidates.filter(
    (f) =>
      normalizeSpreadsheetName(f.name) === 'TEKNIK SINJAI' &&
      String(f.name || '').trim().toUpperCase() !== 'TEKNIK SINJAI'
  );
  const partialMatches = candidates.filter((f) => {
    const n = normalizeSpreadsheetName(f.name);
    return (
      n !== 'TEKNIK SINJAI' &&
      (n.includes('TEKNIK SINJAI') ||
        n.includes('TEKNIK') ||
        n.includes('YANTEK') ||
        n.includes('HVB'))
    );
  });

  const combined = [...exactSpace, ...exactNormalized, ...partialMatches];
  const seen = new Set<string>();
  return combined.filter((f) => {
    if (!f?.id || seen.has(f.id)) return false;
    seen.add(f.id);
    return true;
  });
}

export function findTeknikSinjaiSpreadsheet(
  files: DriveSpreadsheetFile[]
): DriveSpreadsheetFile | undefined {
  return findAllTeknikSinjaiSpreadsheets(files)[0];
}

export function findAllMasterGarduOrTrafoSpreadsheets(
  files: DriveSpreadsheetFile[]
): DriveSpreadsheetFile[] {
  const candidates = files.filter((f) => !isLogistikSpreadsheetTitle(f.name));
  const exactMasterGardu = candidates.filter((f) => {
    const n = normalizeSpreadsheetName(f.name);
    return n === 'MASTER GARDU' || n === 'MANAJEMEN TRAFO' || n === 'SISIP TRAFO';
  });
  const partialMatches = candidates.filter((f) => {
    const n = normalizeSpreadsheetName(f.name);
    return (
      n !== 'MASTER GARDU' &&
      n !== 'MANAJEMEN TRAFO' &&
      n !== 'SISIP TRAFO' &&
      (n.includes('MASTER GARDU') ||
        n.includes('GARDU') ||
        n.includes('TRAFO'))
    );
  });

  const combined = [...exactMasterGardu, ...partialMatches];
  const seen = new Set<string>();
  return combined.filter((f) => {
    if (!f?.id || seen.has(f.id)) return false;
    seen.add(f.id);
    return true;
  });
}

let driveFilesCache: { files: DriveSpreadsheetFile[]; timestamp: number } | null = null;
let inFlightDriveListPromise: Promise<DriveSpreadsheetFile[]> | null = null;

export async function listDriveSpreadsheets(
  accessToken: string,
  forceRefresh = false
): Promise<DriveSpreadsheetFile[]> {
  if (
    !forceRefresh &&
    driveFilesCache &&
    Date.now() - driveFilesCache.timestamp < 45_000
  ) {
    return driveFilesCache.files;
  }
  if (!forceRefresh && inFlightDriveListPromise) {
    return inFlightDriveListPromise;
  }

  inFlightDriveListPromise = (async () => {
    try {
      const generalQuery = encodeURIComponent(
        "mimeType='application/vnd.google-apps.spreadsheet' and trashed=false"
      );

      const generalRes = await sheetsFetchWithRetry(
        `https://www.googleapis.com/drive/v3/files?q=${generalQuery}&pageSize=100&orderBy=modifiedTime desc&supportsAllDrives=true&includeItemsFromAllDrives=true&fields=files(id,name,modifiedTime,webViewLink)`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );

      if (!generalRes.ok) {
        throw new Error(
          await extractGoogleApiError(generalRes, 'Gagal memuat daftar file Google Drive')
        );
      }

      const generalData = await generalRes.json().catch(() => ({}));
      const merged: DriveSpreadsheetFile[] = Array.isArray(generalData.files)
        ? generalData.files
        : [];

      const seen = new Set<string>();
      const uniqueFiles = merged.filter((f) => {
        if (!f?.id || seen.has(f.id)) return false;
        seen.add(f.id);
        return true;
      });
      driveFilesCache = { files: uniqueFiles, timestamp: Date.now() };
      return uniqueFiles;
    } finally {
      inFlightDriveListPromise = null;
    }
  })();

  return inFlightDriveListPromise;
}

const spreadsheetMetadataCache = new Map<
  string,
  { meta: SpreadsheetMetadata; timestamp: number }
>();

export function invalidateSpreadsheetMetadataCache(spreadsheetId?: string) {
  if (spreadsheetId) {
    spreadsheetMetadataCache.delete(spreadsheetId);
  } else {
    spreadsheetMetadataCache.clear();
  }
}

export async function getSpreadsheetMetadata(
  accessToken: string,
  spreadsheetId: string,
  forceRefresh = false
): Promise<SpreadsheetMetadata> {
  const cached = spreadsheetMetadataCache.get(spreadsheetId);
  if (!forceRefresh && cached && Date.now() - cached.timestamp < 60_000) {
    return cached.meta;
  }

  const res = await sheetsFetchWithRetry(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  if (!res.ok) {
    throw new Error(
      await extractGoogleApiError(res, 'Gagal membaca metadata Google Sheet')
    );
  }
  const data = await res.json().catch(() => ({}));
  const sheets: SheetTabInfo[] = (data.sheets || []).map((s: any) => ({
    sheetId: s.properties?.sheetId ?? 0,
    title: s.properties?.title || 'MATERIAL_MASUK',
    rowCount: s.properties?.gridProperties?.rowCount,
    columnCount: s.properties?.gridProperties?.columnCount,
  }));

  const meta: SpreadsheetMetadata = {
    spreadsheetId: data.spreadsheetId || spreadsheetId,
    title: data.properties?.title || 'Google Spreadsheet',
    spreadsheetUrl:
      data.spreadsheetUrl ||
      `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit#gid=0`,
    sheets,
  };
  spreadsheetMetadataCache.set(spreadsheetId, { meta, timestamp: Date.now() });
  return meta;
}

export const SPREADSHEET_HEADERS = [
  'TANGGAL MASUK',
  'SN / KODE MATERIAL',
  'NO MATERIAL',
  'NAMA MATERIAL / SPESIFIKASI',
  'METODE INPUT',
  'KATEGORI',
  'NO BATCH',
  'PETUGAS INPUT',
  'PLANT',
  'STOR LOC',
  'COMPANY CODE',
  'UNIT INDUK',
  'UNIT',
  'GUDANG',
  'STATUS KETERANGAN',
];

export const EKSEKUSI_MIMS_HEADERS = [
  'TIMESTAMP KELUAR',
  'SN / KODE MATERIAL',
  'NO MATERIAL',
  'NAMA MATERIAL / SPESIFIKASI',
  'METODE KELUAR',
  'KATEGORI',
  'NO BATCH',
  'JENIS PENILAIAN',
  'PLANT',
  'STOR LOC',
  'COMPANY CODE',
  'UNIT INDUK',
  'UNIT',
  'GUDANG',
  'STATUS KETERANGAN',
  'NO BON / PK PENGELUARAN',
  'NAMA PETUGAS SCAN',
  'REF BARIS MATERIAL_MASUK',
];

export const REKAP_STOK_HEADERS = [
  'NO MATERIAL',
  'NAMA MATERIAL / SPESIFIKASI',
  'KATEGORI',
  'TOTAL UNIT',
  'STATUS: STOK SIAP',
  'STATUS: TERPAKAI',
  'WAKTU UPDATE REKAP',
];

const GOOGLE_SHEETS_EPOCH_UTC_MS = Date.UTC(1899, 11, 30, 0, 0, 0);

export function normalizeSpreadsheetDateTime(
  raw: unknown,
  forceTimeIfSerial = true
): string {
  const cleaned = String(raw ?? '')
    .trim()
    .replace(/^'+/, '');
  if (!cleaned) return '';

  // Detect Google Sheets / Excel Lotus serial date numbers (e.g. "46344.10299", "46344,10299", "46344")
  if (/^\d{5}(?:[.,]\d+)?$/.test(cleaned)) {
    const normalizedNumStr = cleaned.replace(',', '.');
    const serial = Number(normalizedNumStr);
    if (Number.isFinite(serial) && serial >= 35000 && serial <= 75000) {
      const totalSeconds = Math.round(serial * 86400);
      const dt = new Date(GOOGLE_SHEETS_EPOCH_UTC_MS + totalSeconds * 1000);
      const yyyy = dt.getUTCFullYear();
      const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
      const dd = String(dt.getUTCDate()).padStart(2, '0');
      const hasFraction =
        normalizedNumStr.includes('.') && Math.abs(serial - Math.round(serial)) > 1e-6;
      if (hasFraction || forceTimeIfSerial) {
        const hh = String(dt.getUTCHours()).padStart(2, '0');
        const min = String(dt.getUTCMinutes()).padStart(2, '0');
        const ss = String(dt.getUTCSeconds()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}`;
      }
      return `${yyyy}-${mm}-${dd}`;
    }
  }

  return cleaned;
}

export function formatSheetTextDateCell(
  raw: unknown,
  forceTimeIfSerial = true
): string {
  const normalized = normalizeSpreadsheetDateTime(raw, forceTimeIfSerial);
  if (!normalized) return '';
  return `'${normalized}`;
}

export function materialRowToSheetValues(row: MaterialRow): string[] {
  const isManual =
    row.snMaterial.startsWith('NONQR-') ||
    row.noMaterial === 'TANPA-QR' ||
    row.kategori === 'Material Tanpa QR';
  const metodeInput = isManual ? 'MANUAL TANPA QR' : 'SCAN QR MASUK';
  return [
    formatSheetTextDateCell(row.tanggalHistory, true),
    row.snMaterial || '',
    row.noMaterial || '',
    row.spesifikasi || '',
    row.statusTransaksi && row.statusTransaksi !== 'STOK SIAP ULP'
      ? row.statusTransaksi
      : metodeInput,
    row.kategori || 'kWh Meter',
    row.noBatch || '-',
    String(row.petugas || '').trim() || '-',
    row.plant || '7417',
    row.storLoc || '2500',
    row.companyCode || '74',
    row.unitInduk || 'UIW SULSELRABAR',
    row.unit || 'ULP SINJAI',
    row.storLocName || 'Gd ULP Sinjai',
    row.status || 'STOK SIAP',
  ];
}

export function mimsRowToSheetValues(row: EksekusiMimsRow): string[] {
  const isManual =
    row.snMaterial.startsWith('NONQR-') ||
    row.noMaterial === 'TANPA-QR' ||
    row.kategori === 'Material Tanpa QR';
  const metodeKeluar = isManual ? 'MANUAL TANPA QR' : 'SCAN QR KELUAR';
  return [
    formatSheetTextDateCell(row.timestampEksekusi, true),
    row.snMaterial || '',
    row.noMaterial || '',
    row.spesifikasi || '',
    row.statusTransaksi && row.statusTransaksi !== 'GI KELUAR STOK ULP'
      ? row.statusTransaksi
      : metodeKeluar,
    row.kategori || 'kWh Meter',
    row.noBatch || '-',
    row.valuationType || 'NORMAL',
    row.plant || '7417',
    row.storLoc || '2500',
    row.companyCode || '74',
    row.unitInduk || 'UIW SULSELRABAR',
    row.unit || 'ULP SINJAI',
    row.storLocName || 'Gd ULP Sinjai',
    row.status || 'TERPAKAI',
    row.noDokumen || 'BON-SINJAI',
    String(row.petugas || '').trim() || '-',
    `MATERIAL_MASUK!Baris #${row.sourceMaterialRowNumber}`,
  ];
}

export async function readMaterialRowsFromGoogleSheet(
  accessToken: string,
  spreadsheetId: string,
  sheetTitle: string
): Promise<MaterialRow[]> {
  const actualTitle = await ensureMaterialMasukSheetAndHeader(
    accessToken,
    spreadsheetId,
    sheetTitle
  );
  const encodedRange = encodeURIComponent(quoteSheetRange(actualTitle, 'A1:O5000'));
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}/values/${encodedRange}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (!res.ok) {
    throw new Error(
      await extractGoogleApiError(res, `Gagal membaca baris dari sheet "${actualTitle}"`)
    );
  }

  const data = await res.json().catch(() => ({}));
  const values: string[][] = Array.isArray(data.values) ? data.values : [];
  if (values.length <= 1) {
    return [];
  }

  const rows: MaterialRow[] = [];
  for (let i = 1; i < values.length; i++) {
    const parts = values[i] || [];
    const sn = String(parts[1] || '').trim();
    if (!sn || sn.toUpperCase() === 'SN MATERIAL' || sn.toUpperCase() === 'SN / KODE MATERIAL') {
      continue;
    }

    const rawColO = String(parts[14] || '').trim().toUpperCase();
    const status: MaterialStatus =
      rawColO === 'STOK TERPAKAI' || rawColO === 'TERPAKAI'
        ? 'TERPAKAI'
        : 'STOK SIAP';

    rows.push({
      rowNumber: i + 1,
      tanggalHistory: normalizeSpreadsheetDateTime(parts[0], true),
      snMaterial: sn,
      noMaterial: String(parts[2] || '').trim(),
      spesifikasi: String(parts[3] || '').trim(),
      statusTransaksi: String(parts[4] || 'SCAN QR MASUK').trim(),
      kategori: String(parts[5] || 'kWh Meter').trim(),
      noBatch: String(parts[6] || '').trim(),
      valuationType: String(parts[7] || 'NORMAL').trim(),
      plant: String(parts[8] || '7417').trim(),
      storLoc: String(parts[9] || '2500').trim(),
      companyCode: String(parts[10] || '74').trim(),
      unitInduk: String(parts[11] || 'UIW SULSELRABAR').trim(),
      unit: String(parts[12] || 'ULP SINJAI').trim(),
      storLocName: String(parts[13] || 'Gd ULP Sinjai').trim(),
      status,
      lastScanType: 'INITIAL',
    });
  }

  return rows;
}

export const MATERIAL_KELUAR_GID = 164626621;
export const REKAP_STOK_GID = 164626622;

const repairedDateSheetKeys = new Set<string>();

async function repairSerialDateColumnInSheet(
  accessToken: string,
  spreadsheetId: string,
  tabTitle: string,
  sheetId?: number
): Promise<void> {
  try {
    const colARange = encodeURIComponent(quoteSheetRange(tabTitle, 'A2:A2000'));
    const res = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
        spreadsheetId
      )}/values/${colARange}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );
    if (!res.ok) return;

    const data = await res.json().catch(() => ({}));
    const values: string[][] = Array.isArray(data.values) ? data.values : [];

    const updates: { range: string; majorDimension: string; values: string[][] }[] = [];
    for (let i = 0; i < values.length; i++) {
      const rawVal = String(values[i]?.[0] ?? '').trim();
      if (!rawVal) continue;
      if (/^\d{5}(?:[.,]\d+)?$/.test(rawVal)) {
        const fixedText = formatSheetTextDateCell(rawVal, true);
        const rowNum = i + 2;
        updates.push({
          range: quoteSheetRange(tabTitle, `A${rowNum}`),
          majorDimension: 'ROWS',
          values: [[fixedText]],
        });
      }
    }

    const formatKey = `${spreadsheetId}:${tabTitle}`;
    if (typeof sheetId === 'number' && (!repairedDateSheetKeys.has(formatKey) || updates.length > 0)) {
      repairedDateSheetKeys.add(formatKey);
      await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
          spreadsheetId
        )}:batchUpdate`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            requests: [
              {
                repeatCell: {
                  range: {
                    sheetId,
                    startRowIndex: 1,
                    startColumnIndex: 0,
                    endColumnIndex: 1,
                  },
                  cell: {
                    userEnteredFormat: {
                      numberFormat: {
                        type: 'TEXT',
                      },
                    },
                  },
                  fields: 'userEnteredFormat.numberFormat',
                },
              },
            ],
          }),
        }
      ).catch(() => {});
    }

    if (updates.length > 0) {
      await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
          spreadsheetId
        )}/values:batchUpdate`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            valueInputOption: 'USER_ENTERED',
            data: updates,
          }),
        }
      ).catch(() => {});
    }
  } catch {
    // Non-fatal background date repair
  }
}

export async function ensureMaterialMasukSheetAndHeader(
  accessToken: string,
  spreadsheetId: string,
  preferredTitle = 'MATERIAL_MASUK'
): Promise<string> {
  const meta = await getSpreadsheetMetadata(accessToken, spreadsheetId);
  let matchedSheet =
    meta.sheets.find((s) => s.title.toUpperCase() === 'MATERIAL_MASUK') ||
    meta.sheets.find((s) => s.title.toUpperCase() === preferredTitle.toUpperCase()) ||
    meta.sheets.find((s) => s.title.toUpperCase() === 'MATERIAL');

  let resolvedTitle = matchedSheet ? matchedSheet.title : 'MATERIAL_MASUK';

  if (!matchedSheet) {
    // Check if there is a default empty sheet like Sheet1 / Lembar1 or gid=0
    const defaultSheet =
      meta.sheets.find(
        (s) =>
          s.sheetId === 0 &&
          s.title.toUpperCase() !== 'MATERIAL_KELUAR' &&
          s.title.toUpperCase() !== 'REKAP_STOK'
      ) ||
      meta.sheets.find(
        (s) =>
          /^sheet\d*$/i.test(s.title) ||
          /^lembar\d*$/i.test(s.title)
      );

    if (defaultSheet) {
      resolvedTitle = 'MATERIAL_MASUK';
      const renameRes = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
          spreadsheetId
        )}:batchUpdate`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            requests: [
              {
                updateSheetProperties: {
                  properties: {
                    sheetId: defaultSheet.sheetId,
                    title: resolvedTitle,
                    gridProperties: {
                      rowCount: Math.max(defaultSheet.rowCount || 1000, 1000),
                      columnCount: Math.max(defaultSheet.columnCount || 15, 15),
                      frozenRowCount: 1,
                    },
                  },
                  fields: 'title,gridProperties.frozenRowCount,gridProperties.columnCount',
                },
              },
            ],
          }),
        }
      );
      if (!renameRes.ok) {
        resolvedTitle = defaultSheet.title;
      }
    } else {
      resolvedTitle = 'MATERIAL_MASUK';
      await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
          spreadsheetId
        )}:batchUpdate`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            requests: [
              {
                addSheet: {
                  properties: {
                    title: resolvedTitle,
                    gridProperties: {
                      rowCount: 1000,
                      columnCount: 15,
                      frozenRowCount: 1,
                    },
                  },
                },
              },
            ],
          }),
        }
      );
    }
  }

  // Ensure Row 1 of MATERIAL_MASUK has the 15-column headers matching Menu Masuk inputs
  const headerRange = encodeURIComponent(quoteSheetRange(resolvedTitle, 'A1:O1'));
  const checkRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}/values/${headerRange}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  let needsHeader = true;
  if (checkRes.ok) {
    const checkData = await checkRes.json().catch(() => ({}));
    const row1: string[] = Array.isArray(checkData.values?.[0]) ? checkData.values[0] : [];
    const colA = String(row1[0] || '').trim().toUpperCase();
    const colD = String(row1[3] || '').trim().toUpperCase();
    if (
      row1.length >= 15 &&
      (colA === 'TANGGAL MASUK' || colA === 'TANGGAL HISTORY') &&
      colD.includes('NAMA MATERIAL')
    ) {
      needsHeader = false;
    }
  }

  if (needsHeader) {
    if (matchedSheet && (matchedSheet.columnCount || 0) < 15) {
      await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
          spreadsheetId
        )}:batchUpdate`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            requests: [
              {
                updateSheetProperties: {
                  properties: {
                    sheetId: matchedSheet.sheetId,
                    gridProperties: {
                      columnCount: 15,
                      frozenRowCount: 1,
                    },
                  },
                  fields: 'gridProperties.columnCount,gridProperties.frozenRowCount',
                },
              },
            ],
          }),
        }
      ).catch(() => {});
    }

    const headerPutRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
        spreadsheetId
      )}/values/${headerRange}?valueInputOption=USER_ENTERED`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          majorDimension: 'ROWS',
          values: [SPREADSHEET_HEADERS],
        }),
      }
    );
    if (!headerPutRes.ok) {
      throw new Error(
        await extractGoogleApiError(
          headerPutRes,
          `Gagal menulis header sheet "${resolvedTitle}"`
        )
      );
    }
  }

  await repairSerialDateColumnInSheet(
    accessToken,
    spreadsheetId,
    resolvedTitle,
    matchedSheet?.sheetId ?? 0
  );

  return resolvedTitle;
}

export async function ensureEksekusiMimsSheetAndHeader(
  accessToken: string,
  spreadsheetId: string,
  mimsTabTitle = 'MATERIAL_KELUAR'
): Promise<string> {
  const meta = await getSpreadsheetMetadata(accessToken, spreadsheetId);
  const matchedSheet =
    meta.sheets.find((s) => s.title.toUpperCase() === 'MATERIAL_KELUAR') ||
    meta.sheets.find((s) => s.sheetId === MATERIAL_KELUAR_GID) ||
    meta.sheets.find((s) => s.title.toUpperCase() === mimsTabTitle.toUpperCase()) ||
    meta.sheets.find((s) => s.title.toUpperCase() === 'EKSEKUSI_MIMS');

  let resolvedTitle = matchedSheet ? matchedSheet.title : mimsTabTitle || 'MATERIAL_KELUAR';

  if (!matchedSheet) {
    resolvedTitle = 'MATERIAL_KELUAR';
    // Create the MATERIAL_KELUAR (gid=164626621) sheet tab automatically if not present
    const addRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
        spreadsheetId
      )}:batchUpdate`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          requests: [
            {
              addSheet: {
                properties: {
                  sheetId: MATERIAL_KELUAR_GID,
                  title: resolvedTitle,
                  gridProperties: {
                    rowCount: 1000,
                    columnCount: 18,
                    frozenRowCount: 1,
                  },
                },
              },
            },
          ],
        }),
      }
    );

    if (!addRes.ok) {
      // Fallback without fixed sheetId in case gid already exists under another tab
      await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
          spreadsheetId
        )}:batchUpdate`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            requests: [
              {
                addSheet: {
                  properties: {
                    title: resolvedTitle,
                    gridProperties: {
                      rowCount: 1000,
                      columnCount: 18,
                      frozenRowCount: 1,
                    },
                  },
                },
              },
            ],
          }),
        }
      );
    }
  }

  // Check if Row 1 of MATERIAL_KELUAR is empty or outdated; write the 18-column header matching Menu Keluar inputs
  const headerRange = encodeURIComponent(quoteSheetRange(resolvedTitle, 'A1:R1'));
  const checkRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}/values/${headerRange}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  let needsHeader = true;
  if (checkRes.ok) {
    const checkData = await checkRes.json().catch(() => ({}));
    const row1: string[] = Array.isArray(checkData.values?.[0]) ? checkData.values[0] : [];
    const colD = String(row1[3] || '').trim().toUpperCase();
    if (row1.length >= 18 && colD.includes('NAMA MATERIAL')) {
      needsHeader = false;
    }
  }

  if (needsHeader) {
    if (matchedSheet && (matchedSheet.columnCount || 0) < 18) {
      await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
          spreadsheetId
        )}:batchUpdate`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            requests: [
              {
                updateSheetProperties: {
                  properties: {
                    sheetId: matchedSheet.sheetId,
                    gridProperties: {
                      columnCount: 18,
                      frozenRowCount: 1,
                    },
                  },
                  fields: 'gridProperties.columnCount,gridProperties.frozenRowCount',
                },
              },
            ],
          }),
        }
      ).catch(() => {});
    }

    const headerPutRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
        spreadsheetId
      )}/values/${headerRange}?valueInputOption=USER_ENTERED`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          majorDimension: 'ROWS',
          values: [EKSEKUSI_MIMS_HEADERS],
        }),
      }
    );
    if (!headerPutRes.ok) {
      throw new Error(
        await extractGoogleApiError(
          headerPutRes,
          `Gagal menulis header sheet "${resolvedTitle}"`
        )
      );
    }
  }

  await repairSerialDateColumnInSheet(
    accessToken,
    spreadsheetId,
    resolvedTitle,
    matchedSheet?.sheetId ?? MATERIAL_KELUAR_GID
  );

  return resolvedTitle;
}

export async function ensureAndSyncRekapStokSheet(
  accessToken: string,
  spreadsheetId: string,
  allRows: MaterialRow[] = []
): Promise<string> {
  const meta = await getSpreadsheetMetadata(accessToken, spreadsheetId);
  const rekapTitle = 'REKAP_STOK';
  const matchedSheet =
    meta.sheets.find((s) => s.title.toUpperCase() === 'REKAP_STOK') ||
    meta.sheets.find((s) => s.sheetId === REKAP_STOK_GID);

  const resolvedTitle = matchedSheet ? matchedSheet.title : rekapTitle;

  if (!matchedSheet) {
    const addRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
        spreadsheetId
      )}:batchUpdate`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          requests: [
            {
              addSheet: {
                properties: {
                  sheetId: REKAP_STOK_GID,
                  title: resolvedTitle,
                  gridProperties: {
                    rowCount: 200,
                    columnCount: 7,
                    frozenRowCount: 1,
                  },
                },
              },
            },
          ],
        }),
      }
    );

    if (!addRes.ok) {
      await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
          spreadsheetId
        )}:batchUpdate`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            requests: [
              {
                addSheet: {
                  properties: {
                    title: resolvedTitle,
                    gridProperties: {
                      rowCount: 200,
                      columnCount: 7,
                      frozenRowCount: 1,
                    },
                  },
                },
              },
            ],
          }),
        }
      );
    }
  }

  // Group allRows per Nomor Material to match Menu Rekap Stok
  const groupMap = new Map<
    string,
    {
      noMaterial: string;
      spesifikasi: string;
      kategori: string;
      total: number;
      siapPakai: number;
      stokTerpakai: number;
    }
  >();

  for (const r of allRows) {
    const key = r.noMaterial || 'TANPA-QR';
    if (!groupMap.has(key)) {
      groupMap.set(key, {
        noMaterial: key,
        spesifikasi: r.spesifikasi || '-',
        kategori: r.kategori || 'Material Gudang',
        total: 0,
        siapPakai: 0,
        stokTerpakai: 0,
      });
    }
    const g = groupMap.get(key)!;
    if (r.spesifikasi && (g.spesifikasi === '-' || !g.spesifikasi)) {
      g.spesifikasi = r.spesifikasi;
    }
    g.total++;
    if (r.status === 'TERPAKAI') {
      g.stokTerpakai++;
    } else {
      g.siapPakai++;
    }
  }

  const nowStr = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const rekapValues: string[][] = [
    REKAP_STOK_HEADERS,
    ...Array.from(groupMap.values()).map((g) => [
      g.noMaterial,
      g.spesifikasi,
      g.kategori,
      String(g.total),
      String(g.siapPakai),
      String(g.stokTerpakai),
      formatSheetTextDateCell(nowStr, true),
    ]),
  ];

  const clearRange = encodeURIComponent(quoteSheetRange(resolvedTitle, 'A1:G500'));
  await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}/values/${clearRange}:clear`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    }
  );

  const updateRange = encodeURIComponent(quoteSheetRange(resolvedTitle, 'A1'));
  const putRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}/values/${updateRange}?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        majorDimension: 'ROWS',
        values: rekapValues,
      }),
    }
  );
  if (!putRes.ok) {
    throw new Error(
      await extractGoogleApiError(putRes, `Gagal memperbarui sheet "${resolvedTitle}"`)
    );
  }

  return resolvedTitle;
}

export async function initializeAndFormatEmptySpreadsheet(
  accessToken: string,
  spreadsheetId: string,
  currentRows: MaterialRow[] = [],
  currentMimsRows: EksekusiMimsRow[] = []
): Promise<SpreadsheetMetadata> {
  // 1. Ensure MATERIAL_MASUK tab & Row 1 Headers
  const masukTab = await ensureMaterialMasukSheetAndHeader(
    accessToken,
    spreadsheetId,
    'MATERIAL_MASUK'
  );
  if (currentRows.length > 0) {
    // Only seed when MATERIAL_MASUK sheet has no existing material rows (empty sheet)
    const checkMasukRange = encodeURIComponent(quoteSheetRange(masukTab, 'B2:B5'));
    const checkMasukRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
        spreadsheetId
      )}/values/${checkMasukRange}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    let masukHasExistingData = false;
    if (checkMasukRes.ok) {
      const checkJson = await checkMasukRes.json().catch(() => ({}));
      const vals: string[][] = Array.isArray(checkJson.values) ? checkJson.values : [];
      masukHasExistingData = vals.some((r) => String(r?.[0] || '').trim() !== '');
    }
    if (!masukHasExistingData) {
      await overwriteGoogleSheetRows(accessToken, spreadsheetId, masukTab, currentRows);
    }
  }

  // 2. Ensure MATERIAL_KELUAR (gid=164626621) tab & Row 1 Headers
  const keluarTab = await ensureEksekusiMimsSheetAndHeader(
    accessToken,
    spreadsheetId,
    'MATERIAL_KELUAR'
  );
  if (currentMimsRows.length > 0) {
    const checkKeluarRange = encodeURIComponent(quoteSheetRange(keluarTab, 'B2:B5'));
    const checkKeluarRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
        spreadsheetId
      )}/values/${checkKeluarRange}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    let keluarHasExistingData = false;
    if (checkKeluarRes.ok) {
      const checkJson = await checkKeluarRes.json().catch(() => ({}));
      const vals: string[][] = Array.isArray(checkJson.values) ? checkJson.values : [];
      keluarHasExistingData = vals.some((r) => String(r?.[0] || '').trim() !== '');
    }
    if (!keluarHasExistingData) {
      await overwriteEksekusiMimsSheetRows(accessToken, spreadsheetId, currentMimsRows, keluarTab);
    }
  }

  // 3. Ensure REKAP_STOK tab & Row 1 Headers + Summary Rows
  await ensureAndSyncRekapStokSheet(accessToken, spreadsheetId, currentRows);

  return await getSpreadsheetMetadata(accessToken, spreadsheetId);
}

export async function appendMimsRowsToGoogleSheet(
  accessToken: string,
  spreadsheetId: string,
  mimsRows: EksekusiMimsRow[],
  mimsTabTitle = 'MATERIAL_KELUAR'
): Promise<string> {
  if (mimsRows.length === 0) return mimsTabTitle;
  const resolvedTitle = await ensureEksekusiMimsSheetAndHeader(
    accessToken,
    spreadsheetId,
    mimsTabTitle
  );

  // Deduplicate against existing SNs in MATERIAL_KELUAR so no SN is appended twice
  const existingSnSet = new Set<string>();
  try {
    const snRange = encodeURIComponent(quoteSheetRange(resolvedTitle, 'B2:B5000'));
    const readRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
        spreadsheetId
      )}/values/${snRange}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (readRes.ok) {
      const readData = await readRes.json().catch(() => ({}));
      const colB: string[][] = Array.isArray(readData.values) ? readData.values : [];
      for (const r of colB) {
        const sn = String(r?.[0] || '').trim().toUpperCase();
        if (sn) existingSnSet.add(sn);
      }
    }
  } catch {
    // Proceed if read check fails
  }

  const uniqueMimsRows = mimsRows.filter((r) => {
    const sn = String(r.snMaterial || '').trim().toUpperCase();
    if (!sn || existingSnSet.has(sn)) return false;
    existingSnSet.add(sn);
    return true;
  });

  if (uniqueMimsRows.length === 0) {
    return resolvedTitle;
  }

  const values = uniqueMimsRows.map((r) => mimsRowToSheetValues(r));
  const appendRange = encodeURIComponent(quoteSheetRange(resolvedTitle, 'A:R'));
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}/values/${appendRange}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        majorDimension: 'ROWS',
        values,
      }),
    }
  );

  if (!res.ok) {
    throw new Error(
      await extractGoogleApiError(
        res,
        `Gagal menulis baris ke Sheet "${resolvedTitle}" di Google Sheets`
      )
    );
  }
  return resolvedTitle;
}

export async function overwriteEksekusiMimsSheetRows(
  accessToken: string,
  spreadsheetId: string,
  mimsRows: EksekusiMimsRow[],
  mimsTabTitle = 'MATERIAL_KELUAR'
): Promise<string> {
  const resolvedTitle = await ensureEksekusiMimsSheetAndHeader(
    accessToken,
    spreadsheetId,
    mimsTabTitle
  );

  const allValues: string[][] = [
    EKSEKUSI_MIMS_HEADERS,
    ...mimsRows.map((r) => mimsRowToSheetValues(r)),
  ];

  const clearRange = encodeURIComponent(quoteSheetRange(resolvedTitle, 'A1:R5000'));
  await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}/values/${clearRange}:clear`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    }
  );

  const updateRange = encodeURIComponent(quoteSheetRange(resolvedTitle, 'A1'));
  const updateRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}/values/${updateRange}?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        majorDimension: 'ROWS',
        values: allValues,
      }),
    }
  );

  if (!updateRes.ok) {
    throw new Error(
      await extractGoogleApiError(
        updateRes,
        `Gagal menyinkronkan Sheet "${resolvedTitle}" ke Google Sheets`
      )
    );
  }
  return resolvedTitle;
}

export async function createNewWarehouseGoogleSheet(
  accessToken: string,
  title: string,
  rows: MaterialRow[],
  mimsRows: EksekusiMimsRow[] = []
): Promise<SpreadsheetMetadata> {
  const createRes = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      properties: {
        title,
      },
      sheets: [
        {
          properties: {
            sheetId: 0,
            title: 'MATERIAL_MASUK',
            gridProperties: {
              rowCount: Math.max(1200, rows.length + 100),
              columnCount: 15,
              frozenRowCount: 1,
            },
          },
        },
        {
          properties: {
            sheetId: MATERIAL_KELUAR_GID,
            title: 'MATERIAL_KELUAR',
            gridProperties: {
              rowCount: Math.max(1000, mimsRows.length + 100),
              columnCount: 18,
              frozenRowCount: 1,
            },
          },
        },
        {
          properties: {
            sheetId: REKAP_STOK_GID,
            title: 'REKAP_STOK',
            gridProperties: {
              rowCount: 200,
              columnCount: 7,
              frozenRowCount: 1,
            },
          },
        },
      ],
    }),
  });

  if (!createRes.ok) {
    const errData = await createRes.json().catch(() => ({}));
    throw new Error(
      errData?.error?.message || `Gagal membuat Google Spreadsheet baru (${createRes.status})`
    );
  }

  const created = await createRes.json().catch(() => ({}));
  const spreadsheetId: string = created.spreadsheetId;

  await overwriteGoogleSheetRows(accessToken, spreadsheetId, 'MATERIAL_MASUK', rows);
  await overwriteEksekusiMimsSheetRows(accessToken, spreadsheetId, mimsRows, 'MATERIAL_KELUAR');
  await ensureAndSyncRekapStokSheet(accessToken, spreadsheetId, rows);

  return {
    spreadsheetId,
    title: created.properties?.title || title,
    spreadsheetUrl:
      created.spreadsheetUrl ||
      `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit#gid=0`,
    sheets: [
      {
        sheetId: 0,
        title: 'MATERIAL_MASUK',
        rowCount: rows.length + 1,
        columnCount: 15,
      },
      {
        sheetId: MATERIAL_KELUAR_GID,
        title: 'MATERIAL_KELUAR',
        rowCount: mimsRows.length + 1,
        columnCount: 18,
      },
      {
        sheetId: REKAP_STOK_GID,
        title: 'REKAP_STOK',
        rowCount: 50,
        columnCount: 7,
      },
    ],
  };
}

export async function overwriteGoogleSheetRows(
  accessToken: string,
  spreadsheetId: string,
  sheetTitle: string,
  rows: MaterialRow[]
): Promise<void> {
  const actualTab = await ensureMaterialMasukSheetAndHeader(
    accessToken,
    spreadsheetId,
    sheetTitle
  );
  const allValues: string[][] = [
    SPREADSHEET_HEADERS,
    ...rows.map((r) => materialRowToSheetValues(r)),
  ];

  const clearRange = encodeURIComponent(quoteSheetRange(actualTab, 'A1:O5000'));
  await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}/values/${clearRange}:clear`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    }
  );

  const updateRange = encodeURIComponent(quoteSheetRange(actualTab, 'A1'));
  const updateRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}/values/${updateRange}?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        majorDimension: 'ROWS',
        values: allValues,
      }),
    }
  );

  if (!updateRes.ok) {
    throw new Error(
      await extractGoogleApiError(updateRes, 'Gagal menulis data ke Google Sheets')
    );
  }
}

export async function resolveOrEnsureMaterialSheetTab(
  accessToken: string,
  spreadsheetId: string,
  preferredTitle: string
): Promise<string> {
  return await ensureMaterialMasukSheetAndHeader(
    accessToken,
    spreadsheetId,
    preferredTitle || 'MATERIAL_MASUK'
  );
}

export async function appendInboundRowsToGoogleSheet(
  accessToken: string,
  spreadsheetId: string,
  sheetTitle: string,
  newRows: MaterialRow[],
  allRowsForRekap?: MaterialRow[]
): Promise<string> {
  const actualTab = await ensureMaterialMasukSheetAndHeader(
    accessToken,
    spreadsheetId,
    sheetTitle
  );

  // Deduplicate against existing SNs in MATERIAL_MASUK so no SN is appended twice
  const existingSnSet = new Set<string>();
  try {
    const snRange = encodeURIComponent(quoteSheetRange(actualTab, 'B2:B5000'));
    const readRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
        spreadsheetId
      )}/values/${snRange}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (readRes.ok) {
      const readData = await readRes.json().catch(() => ({}));
      const colB: string[][] = Array.isArray(readData.values) ? readData.values : [];
      for (const r of colB) {
        const sn = String(r?.[0] || '').trim().toUpperCase();
        if (sn) existingSnSet.add(sn);
      }
    }
  } catch {
    // Proceed if read check fails
  }

  const rowsToInsert = newRows.filter((r) => {
    const sn = String(r.snMaterial || '').trim().toUpperCase();
    if (!sn || existingSnSet.has(sn)) return false;
    existingSnSet.add(sn);
    return true;
  });

  if (rowsToInsert.length > 0) {
    const values = rowsToInsert.map((r) => materialRowToSheetValues(r));
    const appendRange = encodeURIComponent(quoteSheetRange(actualTab, 'A:O'));
    const res = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
        spreadsheetId
      )}/values/${appendRange}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          majorDimension: 'ROWS',
          values,
        }),
      }
    );

    if (!res.ok) {
      throw new Error(
        await extractGoogleApiError(res, 'Gagal menambahkan baris Material Masuk ke Google Sheets')
      );
    }
  }

  // Ensure MATERIAL_KELUAR & REKAP_STOK sheets also exist and stay updated
  await ensureEksekusiMimsSheetAndHeader(accessToken, spreadsheetId, 'MATERIAL_KELUAR').catch(
    () => {}
  );
  if (allRowsForRekap) {
    await ensureAndSyncRekapStokSheet(accessToken, spreadsheetId, allRowsForRekap).catch(() => {});
  }

  return actualTab;
}

export async function updateOutboundStatusInGoogleSheet(
  accessToken: string,
  spreadsheetId: string,
  sheetTitle: string,
  updatedRows: MaterialRow[],
  addedMimsRows: EksekusiMimsRow[] = [],
  allRowsForRekap?: MaterialRow[]
): Promise<string> {
  const actualTab = await ensureMaterialMasukSheetAndHeader(
    accessToken,
    spreadsheetId,
    sheetTitle
  );

  // 1. Fetch current Column B (SN / KODE MATERIAL) from Sheet "MATERIAL_MASUK" to map exact row numbers
  const snRange = encodeURIComponent(quoteSheetRange(actualTab, 'B1:B5000'));
  const readRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}/values/${snRange}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  const snIndexMap = new Map<string, number>();
  if (readRes.ok) {
    const readData = await readRes.json().catch(() => ({}));
    const colBValues: string[][] = Array.isArray(readData.values) ? readData.values : [];
    for (let i = 1; i < colBValues.length; i++) {
      const snVal = String(colBValues[i]?.[0] || '')
        .trim()
        .toUpperCase();
      if (snVal) {
        snIndexMap.set(snVal, i + 1); // 1-based sheet row number
      }
    }
  }

  const dataPayload: { range: string; majorDimension: string; values: string[][] }[] = [];
  const rowsToAppend: MaterialRow[] = [];

  for (const row of updatedRows) {
    const foundRowNum = snIndexMap.get(row.snMaterial.toUpperCase());
    if (foundRowNum && foundRowNum >= 2) {
      dataPayload.push({
        range: quoteSheetRange(actualTab, `A${foundRowNum}`),
        majorDimension: 'ROWS',
        values: [[formatSheetTextDateCell(row.tanggalHistory, true)]],
      });
      if (row.spesifikasi) {
        dataPayload.push({
          range: quoteSheetRange(actualTab, `D${foundRowNum}`),
          majorDimension: 'ROWS',
          values: [[row.spesifikasi]],
        });
      }
      if (row.petugas) {
        dataPayload.push({
          range: quoteSheetRange(actualTab, `H${foundRowNum}`),
          majorDimension: 'ROWS',
          values: [[row.petugas]],
        });
      }
      dataPayload.push({
        range: quoteSheetRange(actualTab, `O${foundRowNum}`),
        majorDimension: 'ROWS',
        values: [['TERPAKAI']],
      });
    } else {
      rowsToAppend.push({
        ...row,
        status: 'TERPAKAI',
      });
    }
  }

  if (dataPayload.length > 0) {
    const batchRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
        spreadsheetId
      )}/values:batchUpdate`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          valueInputOption: 'USER_ENTERED',
          data: dataPayload,
        }),
      }
    );

    if (!batchRes.ok) {
      throw new Error(
        await extractGoogleApiError(
          batchRes,
          'Gagal memperbarui status (TERPAKAI) di Google Sheets'
        )
      );
    }
  }

  if (rowsToAppend.length > 0) {
    const appendValues = rowsToAppend.map((r) => materialRowToSheetValues(r));
    const appendRange = encodeURIComponent(quoteSheetRange(actualTab, 'A:O'));
    const appendRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
        spreadsheetId
      )}/values/${appendRange}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          majorDimension: 'ROWS',
          values: appendValues,
        }),
      }
    );
    if (!appendRes.ok) {
      throw new Error(
        await extractGoogleApiError(
          appendRes,
          `Gagal menambahkan baris TERPAKAI ke Sheet "${actualTab}"`
        )
      );
    }
  }

  // 2. Automatically append the outgoing material rows + timestamp to Sheet "MATERIAL_KELUAR" (gid=164626621)
  if (addedMimsRows.length > 0) {
    await appendMimsRowsToGoogleSheet(accessToken, spreadsheetId, addedMimsRows, 'MATERIAL_KELUAR');
  }

  // 3. Automatically update Sheet "REKAP_STOK"
  if (allRowsForRekap) {
    await ensureAndSyncRekapStokSheet(accessToken, spreadsheetId, allRowsForRekap).catch(() => {});
  }

  return actualTab;
}

// ============================================================================
// INTEGRASI SPREADSHEET "TEKNIK_SINJAI":
// - SHEET "DATA_BASE" (gid=0): PENYULANG, KEYPOINT, SEGMENT, PANJANG KMS, DETAIL PEKERJAAN
// - SHEET "YANTEK" (gid=896667653): REALISASI HARIAN PEKERJAAN YANTEK
// - SHEET "HVB" (gid=1954293988): REALISASI HARIAN HAR VOLUME BASED (HVB)
// ============================================================================

export const YANTEK_DATABASE_GID = 0;
export const YANTEK_SHEET_GID = 896667653;
export const HVB_SHEET_GID = 1954293988;

export const YANTEK_DATABASE_HEADERS = [
  'PENYULANG',
  'KEYPOINT',
  'SEGMENT',
  'PANJANG KMS',
  'DETAIL PEKERJAAN',
];

export const YANTEK_SHEET_HEADERS = [
  'WAKTU LAPORAN',
  'TANGGAL REALISASI',
  'TIM PELAKSANA (UNIT)',
  'NAMA PETUGAS',
  'PENYULANG',
  'KEYPOINT',
  'SEGMENT PEKERJAAN',
  'PANJANG KMS',
  'DETAIL PEKERJAAN',
  'VOLUME PEKERJAAN',
  'TITIK KOORDINAT AWAL',
  'TITIK KOORDINAT AKHIR',
  'JUMLAH REALISASI WO',
  'JUMLAH REALISASI P0',
  'STATUS LAPORAN',
];

export const HVB_SHEET_HEADERS = [
  'WAKTU LAPORAN',
  'TANGGAL REALISASI',
  'TIM PELAKSANA (HVB)',
  'PENYULANG',
  'KEYPOINT',
  'SEGMENT PEKERJAAN',
  'PANJANG KMS',
  'DETAIL PEKERJAAN',
  'VOLUME PEKERJAAN',
  'TITIK KOORDINAT AWAL',
  'TITIK KOORDINAT AKHIR',
  'STATUS LAPORAN',
];

function normalizeSheetKeyCell(val: unknown): string {
  return normalizeSpreadsheetDateTime(val, false)
    .trim()
    .toUpperCase()
    .replace(/^'+/, '')
    .replace(/,/g, '.')
    .replace(/\b0+(\d)/g, '$1')
    .replace(/\s+/g, ' ');
}

export function yantekReportToSheetRows(report: YantekRealisasiReport): string[][] {
  const seenWorkItems = new Set<string>();
  const uniqueItems = (report.pekerjaanList || []).filter((p) => {
    const key = normalizeSheetKeyCell(p.detailPekerjaan);
    if (!key || seenWorkItems.has(key)) return false;
    seenWorkItems.add(key);
    return true;
  });

  const items =
    uniqueItems.length > 0
      ? uniqueItems
      : [{ id: '1', detailPekerjaan: '-', volume: 0 }];

  return items.map((item) => [
    formatSheetTextDateCell(report.timestampLaporan, true),
    formatSheetTextDateCell(report.tanggalLaporan, false),
    report.unitPelaksana,
    report.petugasPelapor || '-',
    report.penyulang,
    report.keypoint,
    report.segment,
    report.panjangKms || '-',
    item.detailPekerjaan,
    String(item.volume),
    report.koordinatAwal,
    report.koordinatAkhir,
    String(report.realisasiWo),
    String(report.realisasiP0),
    'SELESAI',
  ]);
}

export function hvbReportToSheetRows(report: HvbRealisasiReport): string[][] {
  const seenWorkItems = new Set<string>();
  const uniqueItems = (report.pekerjaanList || []).filter((p) => {
    const key = normalizeSheetKeyCell(p.detailPekerjaan);
    if (!key || seenWorkItems.has(key)) return false;
    seenWorkItems.add(key);
    return true;
  });

  const items =
    uniqueItems.length > 0
      ? uniqueItems
      : [{ id: '1', detailPekerjaan: '-', volume: 0 }];

  return items.map((item) => [
    formatSheetTextDateCell(report.timestampLaporan, true),
    formatSheetTextDateCell(report.tanggalLaporan, false),
    report.unitPelaksana,
    report.penyulang,
    report.keypoint,
    report.segment,
    report.panjangKms || '-',
    item.detailPekerjaan,
    String(item.volume),
    report.koordinatAwal,
    report.koordinatAkhir,
    'SELESAI',
  ]);
}

export interface TeknikSheetSyncOptions {
  syncYantek?: boolean;
  syncHvb?: boolean;
  initDb?: boolean;
}

export const KNOWN_TEKNIK_SINJAI_SPREADSHEET_IDS = [
  '1aR6uxb6F2cT-T7yar9K-oV_K9OoEKnZvB84k8X53T5A',
  '1gVuHKNxwqSWn4xKvCvpFv6sMO98nO5UxmMzrQAFoui0',
];

let inFlightTeknikSheetMutex: Promise<any> | null = null;

export async function ensureAndFormatTeknikSinjaiSheets(
  accessToken: string,
  spreadsheetId: string,
  existingReports: YantekRealisasiReport[] = [],
  existingHvbReports: HvbRealisasiReport[] = [],
  options: TeknikSheetSyncOptions = { syncYantek: true, syncHvb: true, initDb: false }
): Promise<SpreadsheetMetadata> {
  if (inFlightTeknikSheetMutex) {
    try {
      await inFlightTeknikSheetMutex;
    } catch {
      // Continue even if previous call failed
    }
  }

  const runOperation = (async () => {
    const shouldSyncYantek = options.syncYantek !== false;
    const shouldSyncHvb = options.syncHvb !== false;
    const shouldInitDb = options.initDb === true;

    let meta = await getSpreadsheetMetadata(accessToken, spreadsheetId);
    const usedSheetIds = new Set(meta.sheets.map((s) => s.sheetId));
    const usedTitlesUpper = new Set(meta.sheets.map((s) => s.title.toUpperCase().trim()));
    let structureChanged = false;

    // ---------------------------------------------------------------------------
    // 1. Ensure Sheet "DATA_BASE" (gid=0) ONLY if missing or initDb requested
    // ---------------------------------------------------------------------------
    const dbSheet =
      meta.sheets.find(
        (s) =>
          s.title.toUpperCase().trim() === 'DATA_BASE' ||
          s.title.toUpperCase().trim() === 'DATABASE'
      ) ||
      meta.sheets.find(
        (s) =>
          s.sheetId === YANTEK_DATABASE_GID &&
          !['YANTEK', 'HVB', 'MATERIAL_MASUK', 'MATERIAL_KELUAR', 'REKAP_STOK'].includes(
            s.title.toUpperCase().trim()
          )
      ) ||
      meta.sheets.find((s) =>
        ['SHEET1', 'LEMBAR1'].includes(s.title.toUpperCase().trim())
      );

    let dbSheetTitle = dbSheet ? dbSheet.title : 'DATA_BASE';
    if (shouldInitDb || !dbSheet) {
      try {
        if (dbSheet) {
          const shouldRenameDb =
            ['SHEET1', 'LEMBAR1'].includes(dbSheet.title.toUpperCase().trim()) &&
            !usedTitlesUpper.has('DATA_BASE');
          if (shouldRenameDb || (dbSheet.rowCount || 0) < 250 || (dbSheet.columnCount || 0) < 5) {
            const props: any = {
              sheetId: dbSheet.sheetId,
              gridProperties: {
                rowCount: Math.max(dbSheet.rowCount || 0, 300),
                columnCount: Math.max(dbSheet.columnCount || 0, 6),
                frozenRowCount: 1,
              },
            };
            const fields = [
              'gridProperties.rowCount',
              'gridProperties.columnCount',
              'gridProperties.frozenRowCount',
            ];
            if (shouldRenameDb) {
              props.title = 'DATA_BASE';
              dbSheetTitle = 'DATA_BASE';
              fields.push('title');
              structureChanged = true;
            }
            await sheetsFetchWithRetry(
              `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
                spreadsheetId
              )}:batchUpdate`,
              {
                method: 'POST',
                headers: {
                  Authorization: `Bearer ${accessToken}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  requests: [{ updateSheetProperties: { properties: props, fields: fields.join(',') } }],
                }),
              }
            );
          }
        } else {
          structureChanged = true;
          await sheetsFetchWithRetry(
            `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
              spreadsheetId
            )}:batchUpdate`,
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                requests: [
                  {
                    addSheet: {
                      properties: {
                        title: 'DATA_BASE',
                        gridProperties: {
                          rowCount: 300,
                          columnCount: 6,
                          frozenRowCount: 1,
                        },
                      },
                    },
                  },
                ],
              }),
            }
          );
        }
      } catch {
        // Non-fatal
      }
    }

    // ---------------------------------------------------------------------------
    // 2. Ensure Sheet "YANTEK" (gid=896667653) when syncing Yantek
    // ---------------------------------------------------------------------------
    if (
      shouldSyncYantek &&
      !meta.sheets.some(
        (s) =>
          s.sheetId === YANTEK_SHEET_GID ||
          s.title.toUpperCase().trim() === 'YANTEK'
      )
    ) {
      invalidateSpreadsheetMetadataCache(spreadsheetId);
      meta = await getSpreadsheetMetadata(accessToken, spreadsheetId, true);
    }

    const yantekSheet =
      meta.sheets.find((s) => s.sheetId === YANTEK_SHEET_GID) ||
      meta.sheets.find((s) => s.title.toUpperCase().trim() === 'YANTEK') ||
      meta.sheets.find((s) => s.title.toUpperCase().includes('YANTEK'));

    let yantekSheetTitle = yantekSheet ? yantekSheet.title : 'YANTEK';
    if (shouldSyncYantek) {
      if (yantekSheet) {
        const isGenericTitle = /^(SHEET\s*\d+|LEMBAR\s*\d+)$/i.test(yantekSheet.title.trim());
        const canRenameToYantek = isGenericTitle && !usedTitlesUpper.has('YANTEK');
        const needsGridExpand =
          (yantekSheet.rowCount || 0) < 500 || (yantekSheet.columnCount || 0) < 15;

        if (canRenameToYantek || needsGridExpand) {
          const props: any = {
            sheetId: yantekSheet.sheetId,
            gridProperties: {
              rowCount: Math.max(yantekSheet.rowCount || 0, 1500),
              columnCount: Math.max(yantekSheet.columnCount || 0, 15),
              frozenRowCount: 1,
            },
          };
          const fields = [
            'gridProperties.rowCount',
            'gridProperties.columnCount',
            'gridProperties.frozenRowCount',
          ];
          if (canRenameToYantek) {
            props.title = 'YANTEK';
            yantekSheetTitle = 'YANTEK';
            fields.push('title');
            structureChanged = true;
          }
          await sheetsFetchWithRetry(
            `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
              spreadsheetId
            )}:batchUpdate`,
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                requests: [{ updateSheetProperties: { properties: props, fields: fields.join(',') } }],
              }),
            }
          ).catch(() => {});
        }
      } else {
        structureChanged = true;
        const props: any = {
          title: 'YANTEK',
          gridProperties: {
            rowCount: 1500,
            columnCount: 15,
            frozenRowCount: 1,
          },
        };
        if (!usedSheetIds.has(YANTEK_SHEET_GID)) {
          props.sheetId = YANTEK_SHEET_GID;
          usedSheetIds.add(YANTEK_SHEET_GID);
        }
        const addYantekRes = await sheetsFetchWithRetry(
          `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
            spreadsheetId
          )}:batchUpdate`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              requests: [{ addSheet: { properties: props } }],
            }),
          }
        );
        if (!addYantekRes.ok) {
          await sheetsFetchWithRetry(
            `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
              spreadsheetId
            )}:batchUpdate`,
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                requests: [
                  {
                    addSheet: {
                      properties: {
                        title: 'YANTEK',
                        gridProperties: {
                          rowCount: 1500,
                          columnCount: 15,
                          frozenRowCount: 1,
                        },
                      },
                    },
                  },
                ],
              }),
            }
          ).catch(() => {});
        }
      }
    }

    // ---------------------------------------------------------------------------
    // 3. Ensure Sheet "HVB" (gid=1954293988) when syncing HVB
    // ---------------------------------------------------------------------------
    if (
      shouldSyncHvb &&
      !meta.sheets.some(
        (s) =>
          s.sheetId === HVB_SHEET_GID ||
          s.title.toUpperCase().trim() === 'HVB'
      )
    ) {
      invalidateSpreadsheetMetadataCache(spreadsheetId);
      meta = await getSpreadsheetMetadata(accessToken, spreadsheetId, true);
    }

    const hvbSheetByGid = meta.sheets.find((s) => s.sheetId === HVB_SHEET_GID);
    const hvbSheetByTitle =
      meta.sheets.find((s) => s.title.toUpperCase().trim() === 'HVB') ||
      meta.sheets.find((s) => s.title.toUpperCase().includes('HVB'));
    const hvbSheet = hvbSheetByGid || hvbSheetByTitle;

    let hvbSheetTitle = hvbSheet ? hvbSheet.title : 'HVB';
    if (shouldSyncHvb) {
      try {
        if (hvbSheet) {
          const isGenericTitle = /^(SHEET\s*\d+|LEMBAR\s*\d+)$/i.test(hvbSheet.title.trim());
          const canRenameToHvb = isGenericTitle && !usedTitlesUpper.has('HVB');
          const needsGridExpand =
            (hvbSheet.rowCount || 0) < 500 || (hvbSheet.columnCount || 0) < 12;

          if (canRenameToHvb || needsGridExpand) {
            const props: any = {
              sheetId: hvbSheet.sheetId,
              gridProperties: {
                rowCount: Math.max(hvbSheet.rowCount || 0, 1500),
                columnCount: Math.max(hvbSheet.columnCount || 0, 12),
                frozenRowCount: 1,
              },
            };
            const fields = [
              'gridProperties.rowCount',
              'gridProperties.columnCount',
              'gridProperties.frozenRowCount',
            ];
            if (canRenameToHvb) {
              props.title = 'HVB';
              fields.push('title');
            }
            const updateHvbPropRes = await sheetsFetchWithRetry(
              `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
                spreadsheetId
              )}:batchUpdate`,
              {
                method: 'POST',
                headers: {
                  Authorization: `Bearer ${accessToken}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  requests: [{ updateSheetProperties: { properties: props, fields: fields.join(',') } }],
                }),
              }
            );
            if (updateHvbPropRes.ok && canRenameToHvb) {
              hvbSheetTitle = 'HVB';
              structureChanged = true;
            }
          }
        } else {
          structureChanged = true;
          const props: any = {
            title: 'HVB',
            gridProperties: {
              rowCount: 1500,
              columnCount: 12,
              frozenRowCount: 1,
            },
          };
          if (!usedSheetIds.has(HVB_SHEET_GID)) {
            props.sheetId = HVB_SHEET_GID;
            usedSheetIds.add(HVB_SHEET_GID);
          }
          const addHvbRes = await sheetsFetchWithRetry(
            `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
              spreadsheetId
            )}:batchUpdate`,
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                requests: [{ addSheet: { properties: props } }],
              }),
            }
          );
          if (!addHvbRes.ok) {
            await sheetsFetchWithRetry(
              `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
                spreadsheetId
              )}:batchUpdate`,
              {
                method: 'POST',
                headers: {
                  Authorization: `Bearer ${accessToken}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  requests: [
                    {
                      addSheet: {
                        properties: {
                          title: 'HVB',
                          gridProperties: {
                            rowCount: 1500,
                            columnCount: 12,
                            frozenRowCount: 1,
                          },
                        },
                      },
                    },
                  ],
                }),
              }
            );
          }
        }
      } catch {
        // Non-fatal
      }
    }

    // Only re-read metadata if a sheet was added or renamed
    if (structureChanged) {
      invalidateSpreadsheetMetadataCache(spreadsheetId);
      meta = await getSpreadsheetMetadata(accessToken, spreadsheetId, true);
      dbSheetTitle =
        meta.sheets.find(
          (s) =>
            s.title.toUpperCase().trim() === 'DATA_BASE' ||
            s.title.toUpperCase().trim() === 'DATABASE'
        )?.title ||
        meta.sheets.find(
          (s) =>
            s.sheetId === YANTEK_DATABASE_GID &&
            !['YANTEK', 'HVB'].includes(s.title.toUpperCase().trim())
        )?.title ||
        dbSheetTitle;
      yantekSheetTitle =
        meta.sheets.find((s) => s.sheetId === YANTEK_SHEET_GID)?.title ||
        meta.sheets.find((s) => s.title.toUpperCase().trim() === 'YANTEK')?.title ||
        meta.sheets.find((s) => s.title.toUpperCase().includes('YANTEK'))?.title ||
        yantekSheetTitle;
      hvbSheetTitle =
        meta.sheets.find((s) => s.sheetId === HVB_SHEET_GID)?.title ||
        meta.sheets.find((s) => s.title.toUpperCase().trim() === 'HVB')?.title ||
        meta.sheets.find((s) => s.title.toUpperCase().includes('HVB'))?.title ||
        hvbSheetTitle;
    }

    // ---------------------------------------------------------------------------
    // 4. Populate DATA_BASE (gid=0) ONLY when explicitly requested
    // ---------------------------------------------------------------------------
    if (shouldInitDb) {
      try {
        const dbCheckRange = encodeURIComponent(quoteSheetRange(dbSheetTitle, 'A1:E5'));
        const dbCheckRes = await sheetsFetchWithRetry(
          `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
            spreadsheetId
          )}/values/${dbCheckRange}`,
          {
            headers: { Authorization: `Bearer ${accessToken}` },
          }
        );
        let dbNeedsInit = true;
        if (dbCheckRes.ok) {
          const dbCheckData = await dbCheckRes.json().catch(() => ({}));
          const vals: string[][] = Array.isArray(dbCheckData.values) ? dbCheckData.values : [];
          if (vals.length >= 2 && vals[0]?.[0] && String(vals[0][0]).trim() !== '1') {
            dbNeedsInit = false;
          }
        }
        if (dbNeedsInit) {
          const dbUpdateRange = encodeURIComponent(quoteSheetRange(dbSheetTitle, 'A1'));
          await sheetsFetchWithRetry(
            `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
              spreadsheetId
            )}/values/${dbUpdateRange}?valueInputOption=USER_ENTERED`,
            {
              method: 'PUT',
              headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                majorDimension: 'ROWS',
                values: DEFAULT_TEKNIK_SINJAI_DATA.rawRows,
              }),
            }
          );
        }
      } catch {
        // Non-fatal
      }
    }

    // ---------------------------------------------------------------------------
    // 5. Read existing rows in Sheet "YANTEK" (gid=896667653), deduplicate and
    //    merge with existingReports, clear stale rows, and write to A1
    // ---------------------------------------------------------------------------
    if (shouldSyncYantek) {
      const targetYantekTabTitles: string[] = [];
      const yantekGidTab = meta.sheets.find((s) => s.sheetId === YANTEK_SHEET_GID);
      if (yantekGidTab?.title) {
        targetYantekTabTitles.push(yantekGidTab.title);
      }
      const namedYantekTab = meta.sheets.find((s) => s.title.toUpperCase().trim() === 'YANTEK');
      if (namedYantekTab?.title && !targetYantekTabTitles.includes(namedYantekTab.title)) {
        targetYantekTabTitles.push(namedYantekTab.title);
      }
      if (!targetYantekTabTitles.includes(yantekSheetTitle)) {
        targetYantekTabTitles.push(yantekSheetTitle);
      }

      const orderedYantekReports = [...existingReports].reverse();

      for (const targetYantekTab of targetYantekTabTitles) {
        const yantekReadRange = encodeURIComponent(quoteSheetTab(targetYantekTab));
        const yantekReadRes = await sheetsFetchWithRetry(
          `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
            spreadsheetId
          )}/values/${yantekReadRange}`,
          {
            headers: { Authorization: `Bearer ${accessToken}` },
          }
        );

        const existingSheetYantekRows: string[][] = [];
        const seenYantekRowKeys = new Set<string>();
        const makeYantekTsKey = (r: string[]) =>
          [r[0], r[2], r[6], r[8]].map(normalizeSheetKeyCell).join('|');
        const makeYantekContentKey = (r: string[]) =>
          [r[1], r[2], r[3], r[6], r[8], r[9], r[10], r[11], r[12], r[13]]
            .map(normalizeSheetKeyCell)
            .join('|');

        if (yantekReadRes.ok) {
          const yantekData = await yantekReadRes.json().catch(() => ({}));
          const rawVals: string[][] = Array.isArray(yantekData.values) ? yantekData.values : [];
          for (let i = 0; i < rawVals.length; i++) {
            const row = rawVals[i] || [];
            const colA = String(row[0] || '').trim().toUpperCase();
            const colB = String(row[1] || '').trim().toUpperCase();
            const colC = String(row[2] || '').trim();
            const colG = String(row[6] || '').trim();
            if (
              colA === 'WAKTU LAPORAN' ||
              colA === 'TIMESTAMP' ||
              colA === '1' ||
              colB === 'TANGGAL REALISASI' ||
              colB === 'TANGGAL' ||
              (!colC && !colG)
            ) {
              continue;
            }
            const normalizedRow: string[] =
              row.length >= 16
                ? [
                    formatSheetTextDateCell(row[0], true),
                    formatSheetTextDateCell(row[1], false),
                    String(row[2] ?? ''),
                    String(row[3] ?? ''),
                    String(row[4] ?? ''),
                    String(row[5] ?? ''),
                    String(row[6] ?? ''),
                    String(row[7] ?? ''),
                    String(row[8] ?? ''),
                    String(row[9] ?? ''),
                    String(row[11] ?? ''),
                    String(row[12] ?? ''),
                    String(row[13] ?? ''),
                    String(row[14] ?? ''),
                    String(row[16] || 'SELESAI'),
                  ]
                : Array.from({ length: 15 }, (_, idx) => {
                    if (idx === 0) return formatSheetTextDateCell(row[0], true);
                    if (idx === 1) return formatSheetTextDateCell(row[1], false);
                    return String(row[idx] ?? (idx === 14 ? 'SELESAI' : ''));
                  });

            const tsKey = makeYantekTsKey(normalizedRow);
            const contentKey = makeYantekContentKey(normalizedRow);
            if (!seenYantekRowKeys.has(tsKey) && !seenYantekRowKeys.has(contentKey)) {
              seenYantekRowKeys.add(tsKey);
              seenYantekRowKeys.add(contentKey);
              existingSheetYantekRows.push(normalizedRow);
            }
          }
        }

        const appYantekRows = orderedYantekReports.flatMap((r) => yantekReportToSheetRows(r));
        const mergedYantekRows: string[][] = [...existingSheetYantekRows];
        for (const appRow of appYantekRows) {
          const tsKey = makeYantekTsKey(appRow);
          const contentKey = makeYantekContentKey(appRow);
          if (!seenYantekRowKeys.has(tsKey) && !seenYantekRowKeys.has(contentKey)) {
            seenYantekRowKeys.add(tsKey);
            seenYantekRowKeys.add(contentKey);
            mergedYantekRows.push(appRow);
          }
        }

        const yantekClearRange = encodeURIComponent(quoteSheetRange(targetYantekTab, 'A1:Z2000'));
        await sheetsFetchWithRetry(
          `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
            spreadsheetId
          )}/values/${yantekClearRange}:clear`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
          }
        ).catch(() => {});

        const yantekWriteRange = encodeURIComponent(quoteSheetRange(targetYantekTab, 'A1'));
        const yantekPutRes = await sheetsFetchWithRetry(
          `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
            spreadsheetId
          )}/values/${yantekWriteRange}?valueInputOption=USER_ENTERED`,
          {
            method: 'PUT',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              majorDimension: 'ROWS',
              values: [YANTEK_SHEET_HEADERS, ...mergedYantekRows],
            }),
          }
        );
        if (!yantekPutRes.ok) {
          throw new Error(
            await extractGoogleApiError(
              yantekPutRes,
              `Gagal menulis data laporan ke Sheet "${targetYantekTab}"`
            )
          );
        }
      }
    }

    // ---------------------------------------------------------------------------
    // 6. Read existing rows in Sheet "HVB" (gid=1954293988), deduplicate and
    //    merge with existingHvbReports, clear stale rows, and write to A1
    // ---------------------------------------------------------------------------
    if (shouldSyncHvb) {
      try {
        const targetHvbTabTitles: string[] = [];
        const gidTab = meta.sheets.find((s) => s.sheetId === HVB_SHEET_GID);
        if (gidTab?.title) {
          targetHvbTabTitles.push(gidTab.title);
        }
        const namedHvbTab = meta.sheets.find((s) => s.title.toUpperCase().trim() === 'HVB');
        if (namedHvbTab?.title && !targetHvbTabTitles.includes(namedHvbTab.title)) {
          targetHvbTabTitles.push(namedHvbTab.title);
        }
        if (!targetHvbTabTitles.includes(hvbSheetTitle)) {
          targetHvbTabTitles.push(hvbSheetTitle);
        }

        const orderedHvbReports = [...existingHvbReports].reverse();

        for (const targetTab of targetHvbTabTitles) {
          const tabMeta = meta.sheets.find((s) => s.title === targetTab);
          if (tabMeta && ((tabMeta.columnCount || 0) < 12 || (tabMeta.rowCount || 0) < 500)) {
            await sheetsFetchWithRetry(
              `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
                spreadsheetId
              )}:batchUpdate`,
              {
                method: 'POST',
                headers: {
                  Authorization: `Bearer ${accessToken}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  requests: [
                    {
                      updateSheetProperties: {
                        properties: {
                          sheetId: tabMeta.sheetId,
                          gridProperties: {
                            rowCount: Math.max(tabMeta.rowCount || 0, 1500),
                            columnCount: Math.max(tabMeta.columnCount || 0, 12),
                          },
                        },
                        fields: 'gridProperties.rowCount,gridProperties.columnCount',
                      },
                    },
                  ],
                }),
              }
            ).catch(() => {});
          }

          const hvbReadRange = encodeURIComponent(quoteSheetTab(targetTab));
          const hvbReadRes = await sheetsFetchWithRetry(
            `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
              spreadsheetId
            )}/values/${hvbReadRange}`,
            {
              headers: { Authorization: `Bearer ${accessToken}` },
            }
          );

          const existingSheetHvbRows: string[][] = [];
          const seenHvbRowKeys = new Set<string>();
          const makeHvbTsKey = (r: string[]) =>
            [r[0], r[2], r[5], r[7]].map(normalizeSheetKeyCell).join('|');
          const makeHvbContentKey = (r: string[]) =>
            [r[1], r[2], r[5], r[7], r[8], r[9], r[10]].map(normalizeSheetKeyCell).join('|');

          if (hvbReadRes.ok) {
            const hvbData = await hvbReadRes.json().catch(() => ({}));
            const rawVals: string[][] = Array.isArray(hvbData.values) ? hvbData.values : [];
            for (let i = 0; i < rawVals.length; i++) {
              const row = rawVals[i] || [];
              const colA = String(row[0] || '').trim().toUpperCase();
              const colB = String(row[1] || '').trim().toUpperCase();
              const colC = String(row[2] || '').trim();
              const colF = String(row[5] || '').trim();
              if (
                colA === 'WAKTU LAPORAN' ||
                colA === 'TIMESTAMP' ||
                colA === '1' ||
                colB === 'TANGGAL REALISASI' ||
                colB === 'TANGGAL' ||
                (!colC && !colF)
              ) {
                continue;
              }
              const normalizedRow: string[] =
                row.length >= 13
                  ? [
                      formatSheetTextDateCell(row[0], true),
                      formatSheetTextDateCell(row[1], false),
                      String(row[2] ?? ''),
                      String(row[3] ?? ''),
                      String(row[4] ?? ''),
                      String(row[5] ?? ''),
                      String(row[6] ?? ''),
                      String(row[7] ?? ''),
                      String(row[8] ?? ''),
                      String(row[10] ?? ''),
                      String(row[11] ?? ''),
                      String(row[13] || 'SELESAI'),
                    ]
                  : Array.from({ length: 12 }, (_, idx) => {
                      if (idx === 0) return formatSheetTextDateCell(row[0], true);
                      if (idx === 1) return formatSheetTextDateCell(row[1], false);
                      return String(row[idx] ?? (idx === 11 ? 'SELESAI' : ''));
                    });

              const tsKey = makeHvbTsKey(normalizedRow);
              const contentKey = makeHvbContentKey(normalizedRow);
              if (!seenHvbRowKeys.has(tsKey) && !seenHvbRowKeys.has(contentKey)) {
                seenHvbRowKeys.add(tsKey);
                seenHvbRowKeys.add(contentKey);
                existingSheetHvbRows.push(normalizedRow);
              }
            }
          }

          const appHvbRows = orderedHvbReports.flatMap((r) => hvbReportToSheetRows(r));
          const mergedHvbRows: string[][] = [...existingSheetHvbRows];
          for (const appRow of appHvbRows) {
            const tsKey = makeHvbTsKey(appRow);
            const contentKey = makeHvbContentKey(appRow);
            if (!seenHvbRowKeys.has(tsKey) && !seenHvbRowKeys.has(contentKey)) {
              seenHvbRowKeys.add(tsKey);
              seenHvbRowKeys.add(contentKey);
              mergedHvbRows.push(appRow);
            }
          }

          const hvbClearRange = encodeURIComponent(quoteSheetRange(targetTab, 'A1:Z2000'));
          await sheetsFetchWithRetry(
            `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
              spreadsheetId
            )}/values/${hvbClearRange}:clear`,
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
              },
            }
          ).catch(() => {});

          const hvbWriteRange = encodeURIComponent(quoteSheetRange(targetTab, 'A1'));
          const hvbPutRes = await sheetsFetchWithRetry(
            `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
              spreadsheetId
            )}/values/${hvbWriteRange}?valueInputOption=USER_ENTERED`,
            {
              method: 'PUT',
              headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                majorDimension: 'ROWS',
                values: [HVB_SHEET_HEADERS, ...mergedHvbRows],
              }),
            }
          );
          if (!hvbPutRes.ok && !shouldSyncYantek) {
            throw new Error(
              await extractGoogleApiError(
                hvbPutRes,
                `Gagal menulis data laporan ke Sheet "${targetTab}"`
              )
            );
          }
        }
      } catch (err) {
        if (!shouldSyncYantek) throw err;
      }
    }

    return meta;
  })();

  inFlightTeknikSheetMutex = runOperation;
  try {
    return await runOperation;
  } finally {
    if (inFlightTeknikSheetMutex === runOperation) {
      inFlightTeknikSheetMutex = null;
    }
  }
}

export async function appendYantekReportToGoogleSheet(
  accessToken: string,
  spreadsheetId: string,
  report: YantekRealisasiReport,
  allReports: YantekRealisasiReport[] = []
): Promise<SpreadsheetMetadata> {
  const combinedReports = [
    report,
    ...allReports.filter((r) => r.id !== report.id),
  ];
  return await ensureAndFormatTeknikSinjaiSheets(
    accessToken,
    spreadsheetId,
    combinedReports,
    [],
    { syncYantek: true, syncHvb: false, initDb: false }
  );
}

let inFlightYantekSyncPromise: Promise<{
  primaryMeta: SpreadsheetMetadata;
  syncedCount: number;
  files: DriveSpreadsheetFile[];
}> | null = null;

export async function syncYantekReportsToAllTeknikSheets(
  accessToken: string,
  reportsToSync: YantekRealisasiReport[],
  preferredSpreadsheetId?: string
): Promise<{
  primaryMeta: SpreadsheetMetadata;
  syncedCount: number;
  files: DriveSpreadsheetFile[];
}> {
  if (inFlightYantekSyncPromise) {
    try {
      await inFlightYantekSyncPromise;
    } catch {
      // Proceed with new sync even if previous failed
    }
  }

  const runSync = (async () => {
    try {
      let files: DriveSpreadsheetFile[] = [];
      try {
        files = await listDriveSpreadsheets(accessToken);
      } catch {
        // Fallback to known TEKNIK SINJAI spreadsheet IDs even if Drive list fails
      }
      const matchingDriveFiles = findAllTeknikSinjaiSpreadsheets(files);

      const exactMatches = matchingDriveFiles.filter(
        (f) => normalizeSpreadsheetName(f.name) === 'TEKNIK SINJAI'
      );

      const candidateIds: string[] = [];
      for (const knownId of KNOWN_TEKNIK_SINJAI_SPREADSHEET_IDS) {
        if (!candidateIds.includes(knownId)) {
          candidateIds.push(knownId);
        }
      }
      if (preferredSpreadsheetId && !candidateIds.includes(preferredSpreadsheetId)) {
        candidateIds.push(preferredSpreadsheetId);
      }
      for (const f of exactMatches) {
        if (!candidateIds.includes(f.id)) {
          candidateIds.push(f.id);
        }
      }
      for (const f of matchingDriveFiles) {
        if (!candidateIds.includes(f.id)) {
          candidateIds.push(f.id);
        }
      }

      if (candidateIds.length === 0) {
        const createdMeta = await createNewTeknikSinjaiGoogleSheet(
          accessToken,
          'TEKNIK SINJAI',
          reportsToSync,
          []
        );
        return {
          primaryMeta: createdMeta,
          syncedCount: 1,
          files,
        };
      }

      // Sync to all matching TEKNIK SINJAI spreadsheets so Sheet YANTEK (gid=896667653) is guaranteed to be updated
      let primaryMeta: SpreadsheetMetadata | null = null;
      let syncedCount = 0;
      let lastError: any = null;

      for (const id of candidateIds.slice(0, 5)) {
        try {
          const checkMeta = await getSpreadsheetMetadata(accessToken, id);
          if (isLogistikSpreadsheetTitle(checkMeta.title)) {
            continue;
          }
          const hasOriginalYantekGid = checkMeta.sheets.some(
            (s) => s.sheetId === YANTEK_SHEET_GID
          );
          const syncedMeta = await ensureAndFormatTeknikSinjaiSheets(
            accessToken,
            id,
            reportsToSync,
            [],
            { syncYantek: true, syncHvb: false, initDb: false }
          );
          syncedCount++;
          if (!primaryMeta || hasOriginalYantekGid) {
            primaryMeta = syncedMeta;
          }
        } catch (err) {
          lastError = err;
        }
      }

      if (primaryMeta) {
        return {
          primaryMeta,
          syncedCount,
          files,
        };
      }

      throw (
        lastError ||
        new Error('Gagal menyinkronkan laporan ke Google Spreadsheet TEKNIK SINJAI.')
      );
    } finally {
      inFlightYantekSyncPromise = null;
    }
  })();

  inFlightYantekSyncPromise = runSync;
  return runSync;
}

export async function appendHvbReportToGoogleSheet(
  accessToken: string,
  spreadsheetId: string,
  report: HvbRealisasiReport,
  allHvbReports: HvbRealisasiReport[] = []
): Promise<SpreadsheetMetadata> {
  const combinedHvb = [
    report,
    ...allHvbReports.filter((r) => r.id !== report.id),
  ];
  return await ensureAndFormatTeknikSinjaiSheets(
    accessToken,
    spreadsheetId,
    [],
    combinedHvb,
    { syncYantek: false, syncHvb: true, initDb: false }
  );
}

let inFlightHvbSyncPromise: Promise<{
  primaryMeta: SpreadsheetMetadata;
  syncedCount: number;
  files: DriveSpreadsheetFile[];
}> | null = null;

export async function syncHvbReportsToAllTeknikSheets(
  accessToken: string,
  hvbReportsToSync: HvbRealisasiReport[],
  preferredSpreadsheetId?: string
): Promise<{
  primaryMeta: SpreadsheetMetadata;
  syncedCount: number;
  files: DriveSpreadsheetFile[];
}> {
  if (inFlightHvbSyncPromise) {
    try {
      await inFlightHvbSyncPromise;
    } catch {
      // Proceed with new sync even if previous failed
    }
  }

  const runSync = (async () => {
    try {
      let files: DriveSpreadsheetFile[] = [];
      try {
        files = await listDriveSpreadsheets(accessToken);
      } catch {
        // Fallback to known TEKNIK SINJAI spreadsheet IDs even if Drive list fails
      }
      const matchingDriveFiles = findAllTeknikSinjaiSpreadsheets(files);

      const exactMatches = matchingDriveFiles.filter(
        (f) => normalizeSpreadsheetName(f.name) === 'TEKNIK SINJAI'
      );

      const candidateIds: string[] = [];
      for (const knownId of KNOWN_TEKNIK_SINJAI_SPREADSHEET_IDS) {
        if (!candidateIds.includes(knownId)) {
          candidateIds.push(knownId);
        }
      }
      if (preferredSpreadsheetId && !candidateIds.includes(preferredSpreadsheetId)) {
        candidateIds.push(preferredSpreadsheetId);
      }
      for (const f of exactMatches) {
        if (!candidateIds.includes(f.id)) {
          candidateIds.push(f.id);
        }
      }
      for (const f of matchingDriveFiles) {
        if (!candidateIds.includes(f.id)) {
          candidateIds.push(f.id);
        }
      }

      if (candidateIds.length === 0) {
        const createdMeta = await createNewTeknikSinjaiGoogleSheet(
          accessToken,
          'TEKNIK SINJAI',
          [],
          hvbReportsToSync
        );
        return {
          primaryMeta: createdMeta,
          syncedCount: 1,
          files,
        };
      }

      // Sync to all matching TEKNIK SINJAI spreadsheets in Drive so the sheet with gid=1954293988 is guaranteed to be updated
      let primaryMeta: SpreadsheetMetadata | null = null;
      let syncedCount = 0;
      let lastError: any = null;

      for (const id of candidateIds.slice(0, 5)) {
        try {
          const checkMeta = await getSpreadsheetMetadata(accessToken, id);
          if (isLogistikSpreadsheetTitle(checkMeta.title)) {
            continue;
          }
          const hasHvbGid = checkMeta.sheets.some((s) => s.sheetId === HVB_SHEET_GID);
          const syncedMeta = await ensureAndFormatTeknikSinjaiSheets(
            accessToken,
            id,
            [],
            hvbReportsToSync,
            { syncYantek: false, syncHvb: true, initDb: false }
          );
          syncedCount++;
          if (!primaryMeta || hasHvbGid) {
            primaryMeta = syncedMeta;
          }
        } catch (err) {
          lastError = err;
        }
      }

      if (primaryMeta) {
        return {
          primaryMeta,
          syncedCount,
          files,
        };
      }

      throw (
        lastError ||
        new Error('Gagal menyinkronkan laporan HVB ke Google Spreadsheet TEKNIK SINJAI.')
      );
    } finally {
      inFlightHvbSyncPromise = null;
    }
  })();

  inFlightHvbSyncPromise = runSync;
  return runSync;
}

export async function readTeknikDatabaseFromGoogleSheet(
  accessToken: string,
  spreadsheetId: string
): Promise<{
  segments: YantekDatabaseSegment[];
  pekerjaanCatalog: string[];
}> {
  const meta = await getSpreadsheetMetadata(accessToken, spreadsheetId);
  const dbTab =
    meta.sheets.find(
      (s) => s.title.toUpperCase() === 'DATA_BASE' || s.title.toUpperCase() === 'DATABASE'
    )?.title ||
    meta.sheets.find(
      (s) =>
        s.sheetId === YANTEK_DATABASE_GID &&
        !['YANTEK', 'HVB', 'MATERIAL_MASUK', 'MATERIAL_KELUAR', 'REKAP_STOK'].includes(
          s.title.toUpperCase()
        )
    )?.title ||
    'DATA_BASE';

  const hasMatchingDbTab = meta.sheets.some((s) => s.title === dbTab);
  if (!hasMatchingDbTab) {
    return {
      segments: DEFAULT_TEKNIK_SINJAI_DATA.segments,
      pekerjaanCatalog: DEFAULT_TEKNIK_SINJAI_DATA.pekerjaanCatalog,
    };
  }

  const range = encodeURIComponent(quoteSheetRange(dbTab, 'A1:E500'));
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}/values/${range}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (!res.ok) {
    return {
      segments: DEFAULT_TEKNIK_SINJAI_DATA.segments,
      pekerjaanCatalog: DEFAULT_TEKNIK_SINJAI_DATA.pekerjaanCatalog,
    };
  }

  const data = await res.json().catch(() => ({}));
  const rows: string[][] = Array.isArray(data.values) ? data.values : [];
  if (rows.length <= 1) {
    return {
      segments: DEFAULT_TEKNIK_SINJAI_DATA.segments,
      pekerjaanCatalog: DEFAULT_TEKNIK_SINJAI_DATA.pekerjaanCatalog,
    };
  }

  // Validate Row 1 headers: Col A = PENYULANG, Col B = KEYPOINT, Col C = SEGMENT
  const headerA = String(rows[0]?.[0] || '').trim().toUpperCase();
  const headerB = String(rows[0]?.[1] || '').trim().toUpperCase();
  const headerC = String(rows[0]?.[2] || '').trim().toUpperCase();
  const isValidDatabaseHeader =
    headerA.includes('PENYULANG') &&
    headerB.includes('KEYPOINT') &&
    headerC.includes('SEGMENT') &&
    !headerC.includes('UNIT') &&
    !headerC.includes('PELAKSANA');

  if (!isValidDatabaseHeader) {
    return {
      segments: DEFAULT_TEKNIK_SINJAI_DATA.segments,
      pekerjaanCatalog: DEFAULT_TEKNIK_SINJAI_DATA.pekerjaanCatalog,
    };
  }

  const segments: YantekDatabaseSegment[] = [];
  const pekerjaanSet = new Set<string>(DEFAULT_TEKNIK_SINJAI_DATA.pekerjaanCatalog);

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i] || [];
    const penyulang = String(r[0] || '').trim();
    const keypoint = String(r[1] || '').trim();
    const segment = String(r[2] || '').trim();
    const panjangKms = String(r[3] || '').trim();
    const detailPekerjaan = String(r[4] || '').trim();

    if (
      segment &&
      !/^(UNIT\s+\d+|UNIT\s+KP|HVB\s+)/i.test(segment)
    ) {
      segments.push({
        rowNumber: i + 1,
        penyulang,
        keypoint,
        segment,
        panjangKms,
      });
    }
    if (detailPekerjaan) {
      pekerjaanSet.add(detailPekerjaan);
    }
  }

  return {
    segments: segments.length > 0 ? segments : DEFAULT_TEKNIK_SINJAI_DATA.segments,
    pekerjaanCatalog: Array.from(pekerjaanSet),
  };
}

export async function createNewTeknikSinjaiGoogleSheet(
  accessToken: string,
  title: string = 'TEKNIK SINJAI',
  reports: YantekRealisasiReport[] = [],
  hvbReports: HvbRealisasiReport[] = []
): Promise<SpreadsheetMetadata> {
  const createRes = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      properties: { title },
      sheets: [
        {
          properties: {
            sheetId: YANTEK_DATABASE_GID,
            title: 'DATA_BASE',
            gridProperties: {
              rowCount: 300,
              columnCount: 6,
              frozenRowCount: 1,
            },
          },
        },
        {
          properties: {
            sheetId: YANTEK_SHEET_GID,
            title: 'YANTEK',
            gridProperties: {
              rowCount: 1500,
              columnCount: 17,
              frozenRowCount: 1,
            },
          },
        },
        {
          properties: {
            sheetId: HVB_SHEET_GID,
            title: 'HVB',
            gridProperties: {
              rowCount: 1500,
              columnCount: 14,
              frozenRowCount: 1,
            },
          },
        },
      ],
    }),
  });

  if (!createRes.ok) {
    const errData = await createRes.json().catch(() => ({}));
    throw new Error(
      errData?.error?.message || `Gagal membuat Google Spreadsheet TEKNIK_SINJAI (${createRes.status})`
    );
  }

  const created = await createRes.json().catch(() => ({}));
  const spreadsheetId: string = created.spreadsheetId;
  return await ensureAndFormatTeknikSinjaiSheets(
    accessToken,
    spreadsheetId,
    reports,
    hvbReports,
    { syncYantek: true, syncHvb: true, initDb: true }
  );
}

// ============================================================================
// SINKRONISASI MANAJEMEN TRAFO & SISIP TRAFO KE SPREADSHEET MASTER GARDU / TEKNIK
// ============================================================================

export const MANAJEMEN_TRAFO_SHEET_GID = 2045619555;
export const SISIP_TRAFO_SHEET_GID = 1390013841;
export const MANAJEMEN_TRAFO_SHEET_TITLE = 'MANAJEMEN TRAFO';
export const SISIP_TRAFO_SHEET_TITLE = ' SISIP TRAFO';
export const TRAFO_SPREADSHEET_STORAGE_KEY = 'simlog_sinjai_trafo_sheet_v1';

export const TRAFO_SHEET_HEADERS = [
  'WAKTU LAPORAN',
  'TANGGAL',
  'JENIS PEKERJAAN',
  'SUMBER MENU',
  'NOMOR BERITA ACARA',
  'UNIT PELAKSANA',
  'ID GARDU / TIANG',
  'NAMA GARDU',
  'PENYULANG',
  'LOKASI / ALAMAT',
  'KOORDINAT (LAT, LNG)',
  'ALASAN PEKERJAAN',
  'MERK TRAFO LAMA',
  'DAYA LAMA (KVA)',
  'NO SERI LAMA',
  'MERK TRAFO BARU / SISIP',
  'DAYA BARU (KVA)',
  'TYPE TRAFO BARU',
  'JENIS MINYAK BARU',
  'NO SERI BARU',
  'TAHUN BUAT BARU',
  'IMPEDANSI (%)',
  'TEG. PRIMER',
  'TEG. SEKUNDER',
  'ARUS PRIMER (A)',
  'ARUS SEKUNDER (A)',
  'VOLUME MINYAK (L)',
  'BERAT TOTAL (KG)',
  'PENGAWAS PEKERJAAN',
  'NIP PENGAWAS',
  'STATUS',
];

export function trafoRecordToSheetRow(rec: TrafoManagementRecord): string[] {
  return [
    formatSheetTextDateCell(rec.timestampLaporan || rec.createdAt, true),
    formatSheetTextDateCell(rec.tanggal, false),
    rec.jenisPekerjaan === 'SISIP' ? 'SISIP TRAFO' : 'MUTASI TRAFO',
    rec.sumberMenu,
    rec.nomorLaporan,
    rec.unitPelaksana,
    rec.garduId,
    rec.namaGardu,
    rec.penyulang,
    rec.lokasi || '-',
    `${rec.koordinat?.lat ?? '-'}, ${rec.koordinat?.lng ?? '-'}`,
    rec.alasanPenggantian || '-',
    rec.jenisPekerjaan === 'SISIP' ? '-' : rec.trafoLama?.merk || '-',
    rec.jenisPekerjaan === 'SISIP' ? '0' : String(rec.trafoLama?.daya || 0),
    rec.jenisPekerjaan === 'SISIP' ? '-' : rec.trafoLama?.nomorSeri || '-',
    rec.trafoBaru?.merk || '-',
    String(rec.trafoBaru?.daya || rec.trafoBaru?.kapasitasKva || 0),
    rec.trafoBaru?.type || '-',
    rec.trafoBaru?.jenisMinyak || '-',
    rec.trafoBaru?.nomorSeri || '-',
    rec.trafoBaru?.tahunBuat || '-',
    rec.trafoBaru?.impedansi || '-',
    rec.trafoBaru?.teganganPrimer || '-',
    rec.trafoBaru?.teganganSekunder || '-',
    String(rec.trafoBaru?.arusPrimer ?? 0),
    String(rec.trafoBaru?.arusSekunder ?? 0),
    String(rec.trafoBaru?.volumeMinyak ?? '-'),
    String(rec.trafoBaru?.beratTotal ?? 0),
    rec.namaPengawas || '-',
    rec.nipPengawas || '-',
    rec.statusApproval || 'PENDING',
  ];
}

function normalizeTrafoTabTitle(title: string): string {
  return String(title || '')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function mapTrafoRecordToCustomHeaders(
  headers: string[],
  rec: TrafoManagementRecord
): string[] {
  return headers.map((rawHeader) => {
    const h = String(rawHeader || '').trim().toUpperCase();
    if (!h) return '';
    if (h.includes('WAKTU') || h.includes('TIMESTAMP')) {
      return formatSheetTextDateCell(rec.timestampLaporan || rec.createdAt, true);
    }
    if (h === 'TANGGAL' || h.includes('TGL')) {
      return formatSheetTextDateCell(rec.tanggal, false);
    }
    if (h.includes('JENIS PEKERJAAN') || h === 'JENIS') {
      return rec.jenisPekerjaan === 'SISIP' ? 'SISIP TRAFO' : 'MUTASI TRAFO';
    }
    if (h.includes('SUMBER')) return rec.sumberMenu;
    if (h.includes('BERITA ACARA') || h.includes('NO BA') || h.includes('NOMOR LAPORAN') || h === 'NOMOR') {
      return rec.nomorLaporan;
    }
    if (h.includes('UNIT') || h.includes('ULP')) return rec.unitPelaksana;
    if (h.includes('ID GARDU') || h.includes('KODE GARDU') || h === 'TRAFO' || h === 'GARDU') {
      return rec.garduId;
    }
    if (h.includes('NAMA GARDU')) return rec.namaGardu;
    if (h.includes('PENYULANG')) return rec.penyulang;
    if (h.includes('LOKASI') || h.includes('ALAMAT')) return rec.lokasi || '-';
    if (h.includes('LAT') && !h.includes('LNG')) return String(rec.koordinat?.lat ?? '-');
    if (h.includes('LNG') || h.includes('LONG') || h === 'Y') return String(rec.koordinat?.lng ?? '-');
    if (h.includes('KOORDINAT')) {
      return `${rec.koordinat?.lat ?? '-'}, ${rec.koordinat?.lng ?? '-'}`;
    }
    if (h.includes('ALASAN')) return rec.alasanPenggantian || '-';
    if (h.includes('MERK') && h.includes('LAMA')) return rec.trafoLama?.merk || '-';
    if (h.includes('DAYA') && h.includes('LAMA')) return String(rec.trafoLama?.daya || 0);
    if (h.includes('SERI') && h.includes('LAMA')) return rec.trafoLama?.nomorSeri || '-';
    if (h.includes('MERK')) return rec.trafoBaru?.merk || '-';
    if (h.includes('DAYA') || h.includes('KVA') || h.includes('KAPASITAS')) {
      return String(rec.trafoBaru?.daya || rec.trafoBaru?.kapasitasKva || 0);
    }
    if (h.includes('TYPE') || h.includes('TIPE') || h.includes('KONSTRUKSI')) {
      return rec.trafoBaru?.type || '-';
    }
    if (h.includes('MINYAK') && !h.includes('VOLUME') && !h.includes('VOL')) {
      return rec.trafoBaru?.jenisMinyak || '-';
    }
    if (h.includes('SERI')) return rec.trafoBaru?.nomorSeri || '-';
    if (h.includes('TAHUN')) return rec.trafoBaru?.tahunBuat || '-';
    if (h.includes('IMPEDANSI')) return rec.trafoBaru?.impedansi || '-';
    if (h.includes('TEG') && h.includes('PRIMER')) return rec.trafoBaru?.teganganPrimer || '-';
    if (h.includes('TEG') && h.includes('SEKUNDER')) return rec.trafoBaru?.teganganSekunder || '-';
    if (h.includes('ARUS') && h.includes('PRIMER')) return String(rec.trafoBaru?.arusPrimer ?? 0);
    if (h.includes('ARUS') && h.includes('SEKUNDER')) return String(rec.trafoBaru?.arusSekunder ?? 0);
    if (h.includes('VOLUME') || h.includes('VOL')) return String(rec.trafoBaru?.volumeMinyak ?? '-');
    if (h.includes('BERAT')) return String(rec.trafoBaru?.beratTotal ?? 0);
    if (h.includes('PENGAWAS') || h.includes('PETUGAS')) return rec.namaPengawas || '-';
    if (h.includes('NIP')) return rec.nipPengawas || '-';
    if (h.includes('STATUS')) return rec.statusApproval || 'PENDING';
    if (h.includes('FASA') || h.includes('PHASE')) return rec.trafoBaru?.fasa || '-';
    return '';
  });
}

export async function syncTrafoRecordsToSpreadsheet(
  accessToken: string,
  spreadsheetId: string,
  records: TrafoManagementRecord[]
): Promise<SpreadsheetMetadata> {
  let meta = await getSpreadsheetMetadata(accessToken, spreadsheetId);
  const mutasiRecords = records.filter((r) => r.jenisPekerjaan === 'MUTASI');
  const sisipRecords = records.filter((r) => r.jenisPekerjaan === 'SISIP');

  const targets: {
    preferredGid: number;
    defaultTitle: string;
    rows: TrafoManagementRecord[];
  }[] = [];

  if (mutasiRecords.length > 0) {
    targets.push({
      preferredGid: MANAJEMEN_TRAFO_SHEET_GID,
      defaultTitle: MANAJEMEN_TRAFO_SHEET_TITLE,
      rows: mutasiRecords,
    });
  }
  if (sisipRecords.length > 0) {
    targets.push({
      preferredGid: SISIP_TRAFO_SHEET_GID,
      defaultTitle: SISIP_TRAFO_SHEET_TITLE,
      rows: sisipRecords,
    });
  }

  for (const target of targets) {
    let tab =
      meta.sheets.find((s) => s.sheetId === target.preferredGid) ||
      meta.sheets.find((s) => s.title === target.defaultTitle) ||
      meta.sheets.find(
        (s) =>
          normalizeTrafoTabTitle(s.title) ===
          normalizeTrafoTabTitle(target.defaultTitle)
      );

    const tabTitle = tab ? tab.title : target.defaultTitle;
    if (!tab) {
      await sheetsFetchWithRetry(
        `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
          spreadsheetId
        )}:batchUpdate`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            requests: [
              {
                addSheet: {
                  properties: {
                    title: tabTitle,
                    gridProperties: {
                      rowCount: 1000,
                      columnCount: TRAFO_SHEET_HEADERS.length,
                      frozenRowCount: 1,
                    },
                  },
                },
              },
            ],
          }),
        }
      );
      invalidateSpreadsheetMetadataCache(spreadsheetId);
      meta = await getSpreadsheetMetadata(accessToken, spreadsheetId, true);
    }

    let existingValues: string[][] = [];
    const existingRes = await sheetsFetchWithRetry(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
        spreadsheetId
      )}/values/${encodeURIComponent(quoteSheetRange(tabTitle, 'A1:AZ1000'))}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    ).catch(() => null);

    if (existingRes && existingRes.ok) {
      const json = await existingRes.json().catch(() => ({}));
      existingValues = Array.isArray(json.values) ? json.values : [];
    }

    const row1 = (existingValues[0] || []).map((c) => String(c || '').trim());
    const hasCustomExistingHeaders =
      row1.some((c) => c.length > 0) &&
      !(
        row1[0]?.toUpperCase() === 'WAKTU LAPORAN' &&
        row1[4]?.toUpperCase() === 'NOMOR BERITA ACARA'
      );

    if (hasCustomExistingHeaders) {
      // Preserve custom Master Gardu headers & rows; align by column name or append
      const baColIdx = row1.findIndex((c) => {
        const u = c.toUpperCase();
        return u.includes('BERITA ACARA') || u.includes('NO BA') || u.includes('NOMOR');
      });
      const garduColIdx = row1.findIndex((c) => {
        const u = c.toUpperCase();
        return u.includes('ID GARDU') || u === 'GARDU' || u === 'TRAFO';
      });
      const canMapCustom = baColIdx >= 0 || garduColIdx >= 0;

      const updatedRows = existingValues.slice();
      for (const rec of target.rows) {
        const mappedRow = canMapCustom
          ? mapTrafoRecordToCustomHeaders(row1, rec)
          : trafoRecordToSheetRow(rec);
        const baKey = String(rec.nomorLaporan || '').trim().toUpperCase();
        const garduKey = String(rec.garduId || '').trim().toUpperCase();

        const existingIdx = updatedRows.findIndex((r, idx) => {
          if (idx === 0) return false;
          const rBa = baColIdx >= 0 ? String(r[baColIdx] || '').trim().toUpperCase() : '';
          const rGardu =
            garduColIdx >= 0 ? String(r[garduColIdx] || '').trim().toUpperCase() : '';
          if (baKey && rBa === baKey) return true;
          return Boolean(baKey && r.some((cell) => String(cell || '').trim().toUpperCase() === baKey)) ||
            Boolean(rBa && rBa === baKey && rGardu === garduKey);
        });

        if (existingIdx > 0) {
          updatedRows[existingIdx] = mappedRow;
        } else {
          updatedRows.push(mappedRow);
        }
      }

      await sheetsFetchWithRetry(
        `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
          spreadsheetId
        )}/values/${encodeURIComponent(quoteSheetRange(tabTitle, 'A1'))}?valueInputOption=USER_ENTERED`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            majorDimension: 'ROWS',
            values: updatedRows,
          }),
        }
      );
    } else {
      const existingRowsMap = new Map<string, string[]>();
      for (let i = 1; i < existingValues.length; i++) {
        const row = existingValues[i];
        if (!row || row.every((c) => !String(c || '').trim())) continue;
        const baKey = String(row[4] || '').trim().toUpperCase();
        const garduKey = String(row[6] || '').trim().toUpperCase();
        if (baKey || garduKey) {
          existingRowsMap.set(
            `${baKey}|${garduKey}`,
            row.map((c) => String(c ?? ''))
          );
        }
      }

      for (const rec of target.rows) {
        const sheetRow = trafoRecordToSheetRow(rec);
        const baKey = String(rec.nomorLaporan || '').trim().toUpperCase();
        const garduKey = String(rec.garduId || '').trim().toUpperCase();
        existingRowsMap.set(`${baKey}|${garduKey}`, sheetRow);
      }

      const allValues: string[][] = [
        TRAFO_SHEET_HEADERS,
        ...Array.from(existingRowsMap.values()),
      ];
      await sheetsFetchWithRetry(
        `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
          spreadsheetId
        )}/values/${encodeURIComponent(quoteSheetRange(tabTitle, 'A1'))}?valueInputOption=USER_ENTERED`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            majorDimension: 'ROWS',
            values: allValues,
          }),
        }
      );
    }
  }

  return meta;
}

export async function syncTrafoRecordsToAllTeknikSheets(
  accessToken: string,
  records: TrafoManagementRecord[],
  preferredSpreadsheetId?: string
): Promise<{
  primaryMeta: SpreadsheetMetadata;
  syncedCount: number;
}> {
  let savedTrafoSheetId: string | undefined;
  try {
    const raw = localStorage.getItem(TRAFO_SPREADSHEET_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.spreadsheetId) savedTrafoSheetId = String(parsed.spreadsheetId);
    }
  } catch {
    // Ignore localStorage parse error
  }

  let files: DriveSpreadsheetFile[] = [];
  try {
    files = await listDriveSpreadsheets(accessToken);
  } catch {
    // Fallback to known spreadsheet IDs
  }

  const masterGarduFiles = findAllMasterGarduOrTrafoSpreadsheets(files);
  const teknikFiles = findAllTeknikSinjaiSpreadsheets(files);

  const candidateIds: string[] = [];
  if (savedTrafoSheetId && !candidateIds.includes(savedTrafoSheetId)) {
    candidateIds.push(savedTrafoSheetId);
  }
  if (preferredSpreadsheetId && !candidateIds.includes(preferredSpreadsheetId)) {
    candidateIds.push(preferredSpreadsheetId);
  }
  for (const f of masterGarduFiles) {
    if (!candidateIds.includes(f.id)) candidateIds.push(f.id);
  }
  for (const knownId of KNOWN_TEKNIK_SINJAI_SPREADSHEET_IDS) {
    if (!candidateIds.includes(knownId)) candidateIds.push(knownId);
  }
  for (const f of teknikFiles) {
    if (!candidateIds.includes(f.id)) candidateIds.push(f.id);
  }

  if (candidateIds.length === 0) {
    const createdMeta = await createNewTeknikSinjaiGoogleSheet(accessToken, 'TEKNIK SINJAI');
    candidateIds.push(createdMeta.spreadsheetId);
  }

  // Inspect metadata first to prioritize spreadsheets containing MANAJEMEN TRAFO (gid=2045619555)
  // or SISIP TRAFO (gid=1390013841)
  const inspected: { id: string; meta: SpreadsheetMetadata; hasTrafoTab: boolean }[] = [];
  let lastError: any = null;

  for (const id of candidateIds.slice(0, 8)) {
    try {
      const checkMeta = await getSpreadsheetMetadata(accessToken, id);
      if (isLogistikSpreadsheetTitle(checkMeta.title)) continue;
      const hasTrafoTab = checkMeta.sheets.some(
        (s) =>
          s.sheetId === MANAJEMEN_TRAFO_SHEET_GID ||
          s.sheetId === SISIP_TRAFO_SHEET_GID ||
          normalizeTrafoTabTitle(s.title) === 'MANAJEMEN TRAFO' ||
          normalizeTrafoTabTitle(s.title) === 'SISIP TRAFO'
      );
      inspected.push({ id, meta: checkMeta, hasTrafoTab });
    } catch (err) {
      lastError = err;
    }
  }

  const prioritizedTargets = inspected.some((x) => x.hasTrafoTab)
    ? inspected.filter(
        (x) =>
          x.hasTrafoTab ||
          x.id === savedTrafoSheetId ||
          x.id === preferredSpreadsheetId
      )
    : inspected.slice(0, 4);

  let primaryMeta: SpreadsheetMetadata | null = null;
  let syncedCount = 0;

  for (const target of prioritizedTargets) {
    try {
      const syncedMeta = await syncTrafoRecordsToSpreadsheet(
        accessToken,
        target.id,
        records
      );
      syncedCount++;
      if (!primaryMeta || target.hasTrafoTab) {
        primaryMeta = syncedMeta;
      }
    } catch (err) {
      lastError = err;
    }
  }

  if (primaryMeta) {
    return { primaryMeta, syncedCount };
  }
  throw (
    lastError ||
    new Error(
      'Gagal menyinkronkan data Trafo ke Google Spreadsheet MASTER GARDU / TEKNIK SINJAI.'
    )
  );
}




