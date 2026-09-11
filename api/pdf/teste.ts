type Response = {
  status: (code: number) => Response
  json: (body: unknown) => void
}

export default async function handler(_req: unknown, res: Response) {
  return res.status(200).json({ ok: true, message: 'Function de teste operacional' })
}
