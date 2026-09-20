// NDI is a native SDK. WorshipFlow must never crash the live engine if the
// runtime is missing — SPEC.md Phase 3: the streaming module is optional.

export type NdiTopology = 'overlay' | 'obs-distroav' | 'native-send'

export interface NdiRuntimeStatus {
  found: boolean
  version: '6' | '5' | null
  dllPath: string | null
}

const WINDOWS_CANDIDATES: { version: '6' | '5'; path: string }[] = [
  { version: '6', path: 'C:\\Program Files\\NDI\\NDI 6 Runtime\\v6\\Processing.NDI.Lib.x64.dll' },
  { version: '6', path: 'C:\\Program Files\\NDI\\NDI 6 Runtime\\Processing.NDI.Lib.x64.dll' },
  { version: '5', path: 'C:\\Program Files\\NDI\\NDI 5 Runtime\\v5\\Processing.NDI.Lib.x64.dll' },
]

export function detectNdiRuntime(
  exists: (p: string) => boolean,
  env: NodeJS.Dict<string> = {}
): NdiRuntimeStatus {
  const fromEnv = env.NDI_RUNTIME_DIR
  if (fromEnv) {
    const dll = fromEnv.replace(/[\\/]$/, '') + '\\Processing.NDI.Lib.x64.dll'
    if (exists(dll)) return { found: true, version: '6', dllPath: dll }
  }
  for (const c of WINDOWS_CANDIDATES) {
    if (exists(c.path)) return { found: true, version: c.version, dllPath: c.path }
  }
  return { found: false, version: null, dllPath: null }
}

export function overlayUrl(ip: string, port: number): string {
  return `http://${ip}:${port}/overlay`
}

export function recommendedSourceName(): string {
  return 'WorshipFlow Lyrics'
}
