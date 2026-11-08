// 非公開リポジトリ（study-log-data）の読み書き。GitHub の REST API をブラウザから直接呼ぶ。
// トークン（Fine-grained personal access token）は、この端末の中にだけ保存されている。

export interface RepoFile {
  path: string
  sha: string // ファイルの中身の指紋。中身が変わると変わる
}

/** 同期処理が使う「リポジトリ操作」の形。テストでは偽物に差し替える */
export interface RepoClient {
  listFiles(): Promise<RepoFile[]>
  readFile(sha: string): Promise<string>
  /** ファイルを書き込み、新しい sha を返す。既存ファイルを上書きするときは今の sha が必要 */
  writeFile(path: string, content: string, currentSha: string | undefined, message: string): Promise<string>
}

export class SyncError extends Error {
  constructor(
    message: string,
    readonly kind: 'auth' | 'notFound' | 'conflict' | 'offline' | 'other',
  ) {
    super(message)
  }
}

const API = 'https://api.github.com'

export class GitHubClient implements RepoClient {
  private branch?: string

  constructor(
    private token: string,
    private owner: string,
    private repo: string,
  ) {}

  private async request(path: string, init: RequestInit = {}): Promise<unknown> {
    let res: Response
    try {
      res = await fetch(`${API}/repos/${this.owner}/${this.repo}${path}`, {
        ...init,
        cache: 'no-store',
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${this.token}`,
          'X-GitHub-Api-Version': '2022-11-28',
          ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        },
      })
    } catch {
      throw new SyncError('インターネットにつながっていません', 'offline')
    }
    if (res.status === 401) throw new SyncError('トークンが無効か、期限が切れています', 'auth')
    if (res.status === 403) throw new SyncError('トークンにこのリポジトリへの権限がありません（Contents の Read and write が必要）', 'auth')
    if (res.status === 404) throw new SyncError(`リポジトリ ${this.owner}/${this.repo} が見つかりません（名前かトークンの対象リポジトリを確認）`, 'notFound')
    if (res.status === 409 || res.status === 422) throw new SyncError('ほかの端末と同時に書き込みました', 'conflict')
    if (!res.ok) throw new SyncError(`GitHub がエラーを返しました（${res.status}）`, 'other')
    return res.json()
  }

  private async defaultBranch(): Promise<string> {
    if (!this.branch) {
      const repo = (await this.request('')) as { default_branch: string }
      this.branch = repo.default_branch
    }
    return this.branch
  }

  async listFiles(): Promise<RepoFile[]> {
    const branch = await this.defaultBranch()
    const tree = (await this.request(`/git/trees/${encodeURIComponent(branch)}?recursive=1`)) as {
      tree: { path: string; sha: string; type: string }[]
    }
    return tree.tree.filter((t) => t.type === 'blob').map(({ path, sha }) => ({ path, sha }))
  }

  async readFile(sha: string): Promise<string> {
    const blob = (await this.request(`/git/blobs/${sha}`)) as { content: string }
    return new TextDecoder().decode(base64ToBytes(blob.content))
  }

  async writeFile(path: string, content: string, currentSha: string | undefined, message: string): Promise<string> {
    const branch = await this.defaultBranch()
    const res = (await this.request(`/contents/${path.split('/').map(encodeURIComponent).join('/')}`, {
      method: 'PUT',
      body: JSON.stringify({ message, content: bytesToBase64(new TextEncoder().encode(content)), sha: currentSha, branch }),
    })) as { content: { sha: string } }
    return res.content.sha
  }
}

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64.replace(/\s/g, ''))
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}
