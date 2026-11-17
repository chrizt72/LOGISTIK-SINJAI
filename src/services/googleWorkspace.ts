import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  User,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';
import { MaterialRow, EksekusiMimsRow, MaterialStatus } from '../types/warehouse';

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
  prompt: 'consent',
});

// Flag to indicate if we are in the middle of a sign-in flow.
let isSigningIn = false;
// Cache the access token in memory ONLY (never in localStorage/sessionStorage).
let cachedAccessToken: string | null = null;
let cachedFallbackUser: User | null = null;

declare global {
  interface Window {
    google?: {
      accounts?: {
        oauth2?: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            prompt?: string;
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
export const FIREBASE_AUTH_DOMAINS_URL = `https://console.firebase.google.com/project/${FIREBASE_PROJECT_ID}/authentication/settings`;
export const GCP_OAUTH_CLIENTS_URL = `https://console.cloud.google.com/apis/credentials?project=${FIREBASE_PROJECT_ID}`;

async function fetchGoogleUserProfile(accessToken: string): Promise<User> {
  try {
    const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (res.ok) {
      const profile = await res.json();
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

export const signInWithGoogleIdentityServices = (): Promise<{
  user: User;
  accessToken: string;
}> => {
  return new Promise((resolve, reject) => {
    const oauth2 = window.google?.accounts?.oauth2;
    const clientId = firebaseConfig.oAuthClientId;

    if (!oauth2 || !clientId) {
      reject(
        new Error(
          'Google Identity Services belum siap atau OAuth Client ID tidak ditemukan.'
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
      prompt: 'consent',
      callback: async (response) => {
        if (response.error || !response.access_token) {
          reject(
            new Error(
              response.error_description ||
                response.error ||
                'Gagal mendapatkan token dari Google Identity Services.'
            )
          );
          return;
        }
        cachedAccessToken = response.access_token;
        const user = await fetchGoogleUserProfile(response.access_token);
        cachedFallbackUser = user;
        resolve({ user, accessToken: response.access_token });
      },
      error_callback: (err) => {
        reject(
          new Error(
            err?.message ||
              err?.type ||
              'Popup login Google ditutup atau diblokir oleh browser mobile.'
          )
        );
      },
    });

    tokenClient.requestAccessToken({ prompt: 'consent' });
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
  return { user, accessToken: cleaned };
};

export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      if (cachedAccessToken) {
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
      } else if (!isSigningIn) {
        cachedAccessToken = null;
        if (onAuthFailure) onAuthFailure();
      }
    } else if (cachedFallbackUser && cachedAccessToken) {
      if (onAuthSuccess) onAuthSuccess(cachedFallbackUser, cachedAccessToken);
    } else {
      cachedAccessToken = null;
      if (onAuthFailure) onAuthFailure();
    }
  });
};

export const googleSignIn = async (): Promise<{
  user: User;
  accessToken: string;
} | null> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Gagal mendapatkan access token Google Workspace dari Firebase Auth.');
    }

    cachedAccessToken = credential.accessToken;
    cachedFallbackUser = null;
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    console.error('Firebase signInWithPopup error:', error);
    const errCode = String(error?.code || '');
    const errMsg = String(error?.message || '');

    // If Firebase Auth rejects the mobile/shared domain with auth/unauthorized-domain
    // or popup issues, automatically try Google Identity Services (GIS) OAuth2 Token Client
    if (
      errCode === 'auth/unauthorized-domain' ||
      errMsg.includes('auth/unauthorized-domain') ||
      errCode === 'auth/operation-not-supported-in-this-environment'
    ) {
      try {
        const gisResult = await signInWithGoogleIdentityServices();
        return gisResult;
      } catch (gisErr: any) {
        const currentDomain =
          typeof window !== 'undefined' ? window.location.hostname : '';
        const enhancedError: any = new Error(
          `Domain aplikasi saat ini (${currentDomain}) belum terdaftar di daftar "Authorized domains" Firebase Authentication untuk project "${FIREBASE_PROJECT_ID}".`
        );
        enhancedError.code = 'auth/unauthorized-domain';
        enhancedError.currentDomain = currentDomain;
        enhancedError.firebaseAuthUrl = FIREBASE_AUTH_DOMAINS_URL;
        enhancedError.gisError = gisErr?.message || '';
        throw enhancedError;
      }
    }

    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const getAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken;
};

export const logoutGoogle = async (): Promise<void> => {
  await auth.signOut().catch(() => {});
  cachedAccessToken = null;
  cachedFallbackUser = null;
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

export async function listDriveSpreadsheets(
  accessToken: string
): Promise<DriveSpreadsheetFile[]> {
  const q = encodeURIComponent(
    "mimeType='application/vnd.google-apps.spreadsheet' and trashed=false"
  );
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&pageSize=25&orderBy=modifiedTime desc&fields=files(id,name,modifiedTime,webViewLink)`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(
      errData?.error?.message || `Gagal memuat daftar file Google Drive (${res.status})`
    );
  }
  const data = await res.json();
  return Array.isArray(data.files) ? data.files : [];
}

export async function getSpreadsheetMetadata(
  accessToken: string,
  spreadsheetId: string
): Promise<SpreadsheetMetadata> {
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(
      errData?.error?.message || `Gagal membaca metadata Google Sheet (${res.status})`
    );
  }
  const data = await res.json();
  const sheets: SheetTabInfo[] = (data.sheets || []).map((s: any) => ({
    sheetId: s.properties?.sheetId ?? 0,
    title: s.properties?.title || 'MATERIAL_MASUK',
    rowCount: s.properties?.gridProperties?.rowCount,
    columnCount: s.properties?.gridProperties?.columnCount,
  }));

  return {
    spreadsheetId: data.spreadsheetId || spreadsheetId,
    title: data.properties?.title || 'Google Spreadsheet',
    spreadsheetUrl:
      data.spreadsheetUrl ||
      `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit#gid=0`,
    sheets,
  };
}

export const SPREADSHEET_HEADERS = [
  'TANGGAL HISTORY',
  'SN MATERIAL',
  'NO MATERIAL',
  'SPESIFIKASI',
  'STATUS TRANSAKSI',
  'KATERGORI',
  'NO BATCH',
  'VALUATION TYPE',
  'PLANT',
  'STOR LOC',
  'COMPANY CODE',
  'UNIT INDUK',
  'UNIT',
  'STOR LOC NAME',
  'STATUS',
];

export const EKSEKUSI_MIMS_HEADERS = [
  'TIMESTAMP EKSEKUSI',
  'SN MATERIAL',
  'NO MATERIAL',
  'SPESIFIKASI',
  'STATUS TRANSAKSI',
  'KATERGORI',
  'NO BATCH',
  'VALUATION TYPE',
  'PLANT',
  'STOR LOC',
  'COMPANY CODE',
  'UNIT INDUK',
  'UNIT',
  'STOR LOC NAME',
  'STATUS',
  'NO DOKUMEN / BON',
  'PETUGAS EKSEKUSI',
  'REF BARIS MATERIAL_MASUK',
];

export function materialRowToSheetValues(row: MaterialRow): string[] {
  return [
    row.tanggalHistory || '',
    row.snMaterial || '',
    row.noMaterial || '',
    row.spesifikasi || '',
    row.statusTransaksi || 'STOK SIAP ULP',
    row.kategori || 'kWh Meter',
    row.noBatch || '',
    row.valuationType || 'NORMAL',
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
  return [
    row.timestampEksekusi || '',
    row.snMaterial || '',
    row.noMaterial || '',
    row.spesifikasi || '',
    row.statusTransaksi || 'GI KELUAR STOK ULP',
    row.kategori || 'kWh Meter',
    row.noBatch || '',
    row.valuationType || 'NORMAL',
    row.plant || '7417',
    row.storLoc || '2500',
    row.companyCode || '74',
    row.unitInduk || 'UIW SULSELRABAR',
    row.unit || 'ULP SINJAI',
    row.storLocName || 'Gd ULP Sinjai',
    row.status || 'TERPAKAI',
    row.noDokumen || 'BON-SINJAI',
    row.petugas || 'Petugas Gudang ULP Sinjai',
    `MATERIAL_MASUK!Baris #${row.sourceMaterialRowNumber}`,
  ];
}

export async function readMaterialRowsFromGoogleSheet(
  accessToken: string,
  spreadsheetId: string,
  sheetTitle: string
): Promise<MaterialRow[]> {
  const encodedRange = encodeURIComponent(`${sheetTitle}!A1:O5000`);
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}/values/${encodedRange}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(
      errData?.error?.message || `Gagal membaca baris dari sheet "${sheetTitle}" (${res.status})`
    );
  }

  const data = await res.json();
  const values: string[][] = Array.isArray(data.values) ? data.values : [];
  if (values.length <= 1) {
    return [];
  }

  const rows: MaterialRow[] = [];
  for (let i = 1; i < values.length; i++) {
    const parts = values[i] || [];
    const sn = String(parts[1] || '').trim();
    if (!sn) continue;

    const rawColO = String(parts[14] || '').trim().toUpperCase();
    const status: MaterialStatus =
      rawColO === 'STOK TERPAKAI' || rawColO === 'TERPAKAI'
        ? 'TERPAKAI'
        : 'STOK SIAP';

    rows.push({
      rowNumber: i + 1,
      tanggalHistory: String(parts[0] || '').trim(),
      snMaterial: sn,
      noMaterial: String(parts[2] || '').trim(),
      spesifikasi: String(parts[3] || '').trim(),
      statusTransaksi: String(parts[4] || 'STOK SIAP ULP').trim(),
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

export async function ensureEksekusiMimsSheetAndHeader(
  accessToken: string,
  spreadsheetId: string,
  mimsTabTitle = 'EKSEKUSI_MIMS'
): Promise<void> {
  const meta = await getSpreadsheetMetadata(accessToken, spreadsheetId);
  const hasMimsSheet = meta.sheets.some(
    (s) => s.title.toUpperCase() === mimsTabTitle.toUpperCase()
  );

  if (!hasMimsSheet) {
    // Create the EKSEKUSI_MIMS sheet tab automatically if not present
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
                  title: mimsTabTitle,
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

  // Check if Row 1 of EKSEKUSI_MIMS is empty; if empty, write the 18-column MIMS header
  const headerRange = encodeURIComponent(`${mimsTabTitle}!A1:R1`);
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
    const checkData = await checkRes.json();
    if (
      Array.isArray(checkData.values) &&
      checkData.values.length > 0 &&
      checkData.values[0]?.length > 0
    ) {
      needsHeader = false;
    }
  }

  if (needsHeader) {
    await fetch(
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
  }
}

export async function appendMimsRowsToGoogleSheet(
  accessToken: string,
  spreadsheetId: string,
  mimsRows: EksekusiMimsRow[],
  mimsTabTitle = 'EKSEKUSI_MIMS'
): Promise<void> {
  if (mimsRows.length === 0) return;
  await ensureEksekusiMimsSheetAndHeader(accessToken, spreadsheetId, mimsTabTitle);

  const values = mimsRows.map((r) => mimsRowToSheetValues(r));
  const appendRange = encodeURIComponent(`${mimsTabTitle}!A:R`);
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
    const errData = await res.json().catch(() => ({}));
    throw new Error(
      errData?.error?.message ||
        `Gagal menulis baris ke Sheet "${mimsTabTitle}" di Google Sheets (${res.status})`
    );
  }
}

export async function overwriteEksekusiMimsSheetRows(
  accessToken: string,
  spreadsheetId: string,
  mimsRows: EksekusiMimsRow[],
  mimsTabTitle = 'EKSEKUSI_MIMS'
): Promise<void> {
  await ensureEksekusiMimsSheetAndHeader(accessToken, spreadsheetId, mimsTabTitle);

  const allValues: string[][] = [
    EKSEKUSI_MIMS_HEADERS,
    ...mimsRows.map((r) => mimsRowToSheetValues(r)),
  ];

  const clearRange = encodeURIComponent(`${mimsTabTitle}!A1:R5000`);
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

  const updateRange = encodeURIComponent(`${mimsTabTitle}!A1`);
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
    const errData = await updateRes.json().catch(() => ({}));
    throw new Error(
      errData?.error?.message ||
        `Gagal menyinkronkan Sheet "${mimsTabTitle}" ke Google Sheets (${updateRes.status})`
    );
  }
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
            sheetId: 1,
            title: 'EKSEKUSI_MIMS',
            gridProperties: {
              rowCount: Math.max(1000, mimsRows.length + 100),
              columnCount: 18,
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

  const created = await createRes.json();
  const spreadsheetId: string = created.spreadsheetId;

  await overwriteGoogleSheetRows(accessToken, spreadsheetId, 'MATERIAL_MASUK', rows);
  await overwriteEksekusiMimsSheetRows(accessToken, spreadsheetId, mimsRows, 'EKSEKUSI_MIMS');

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
        sheetId: 1,
        title: 'EKSEKUSI_MIMS',
        rowCount: mimsRows.length + 1,
        columnCount: 18,
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
  const allValues: string[][] = [
    SPREADSHEET_HEADERS,
    ...rows.map((r) => materialRowToSheetValues(r)),
  ];

  const clearRange = encodeURIComponent(`${sheetTitle}!A1:O5000`);
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

  const updateRange = encodeURIComponent(`${sheetTitle}!A1`);
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
    const errData = await updateRes.json().catch(() => ({}));
    throw new Error(
      errData?.error?.message || `Gagal menulis data ke Google Sheets (${updateRes.status})`
    );
  }
}

export async function resolveOrEnsureMaterialSheetTab(
  accessToken: string,
  spreadsheetId: string,
  preferredTitle: string
): Promise<string> {
  try {
    const meta = await getSpreadsheetMetadata(accessToken, spreadsheetId);
    const exactMatch = meta.sheets.find(
      (s) => s.title.toUpperCase() === preferredTitle.toUpperCase()
    );
    if (exactMatch) {
      return exactMatch.title;
    }

    const fallbackMatch =
      meta.sheets.find(
        (s) =>
          s.title.toUpperCase() === 'MATERIAL_MASUK' ||
          s.title.toUpperCase() === 'MATERIAL'
      ) ||
      meta.sheets.find((s) => s.sheetId === 0) ||
      meta.sheets[0];

    if (fallbackMatch) {
      return fallbackMatch.title;
    }
  } catch {
    // Fallback to preferredTitle
  }
  return preferredTitle || 'MATERIAL_MASUK';
}

export async function appendInboundRowsToGoogleSheet(
  accessToken: string,
  spreadsheetId: string,
  sheetTitle: string,
  newRows: MaterialRow[]
): Promise<string> {
  const actualTab = await resolveOrEnsureMaterialSheetTab(
    accessToken,
    spreadsheetId,
    sheetTitle
  );
  const values = newRows.map((r) => materialRowToSheetValues(r));
  const appendRange = encodeURIComponent(`${actualTab}!A:O`);
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
    const errData = await res.json().catch(() => ({}));
    throw new Error(
      errData?.error?.message ||
        `Gagal menambahkan baris Material Masuk ke Google Sheets (${res.status})`
    );
  }
  return actualTab;
}

export async function updateOutboundStatusInGoogleSheet(
  accessToken: string,
  spreadsheetId: string,
  sheetTitle: string,
  updatedRows: MaterialRow[],
  addedMimsRows: EksekusiMimsRow[] = []
): Promise<string> {
  const actualTab = await resolveOrEnsureMaterialSheetTab(
    accessToken,
    spreadsheetId,
    sheetTitle
  );

  // 1. Fetch current Column B (SN MATERIAL) from Sheet "MATERIAL_MASUK" to map exact row numbers
  const snRange = encodeURIComponent(`${actualTab}!B1:B5000`);
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
    const readData = await readRes.json();
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
        range: `${actualTab}!A${foundRowNum}`,
        majorDimension: 'ROWS',
        values: [[row.tanggalHistory]],
      });
      dataPayload.push({
        range: `${actualTab}!O${foundRowNum}`,
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
      const errData = await batchRes.json().catch(() => ({}));
      throw new Error(
        errData?.error?.message ||
          `Gagal memperbarui status (TERPAKAI) di Google Sheets (${batchRes.status})`
      );
    }
  }

  if (rowsToAppend.length > 0) {
    const appendValues = rowsToAppend.map((r) => materialRowToSheetValues(r));
    const appendRange = encodeURIComponent(`${actualTab}!A:O`);
    await fetch(
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
  }

  // 2. Automatically append the outgoing material rows + timestamp to Sheet "EKSEKUSI_MIMS"
  if (addedMimsRows.length > 0) {
    await appendMimsRowsToGoogleSheet(accessToken, spreadsheetId, addedMimsRows, 'EKSEKUSI_MIMS');
  }
  return actualTab;
}

