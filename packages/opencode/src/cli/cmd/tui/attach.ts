import { cmd } from "../cmd"
import { tui } from "./app"
import { getAuthorizationHeader } from "../../../flag/auth"

export const AttachCommand = cmd({
  command: "attach <url>",
  describe: "attach to a running opencode server",
  builder: (yargs) =>
    yargs
      .positional("url", {
        type: "string",
        describe: "http://localhost:4096",
        demandOption: true,
      })
      .option("dir", {
        type: "string",
        description: "directory to run in",
      })
      .option("session", {
        alias: ["s"],
        type: "string",
        describe: "session id to continue",
      })
      .option("password", {
        alias: ["p"],
        type: "string",
        describe: "basic auth password (defaults to OPENCODE_SERVER_PASSWORD)",
      }),
  handler: async (args) => {
    const directory = (() => {
      if (!args.dir) return undefined
      try {
        process.chdir(args.dir)
        return process.cwd()
      } catch {
        // If the directory doesn't exist locally (remote attach), pass it through.
        return args.dir
      }
    }

    // If server requires authentication, create a custom fetch that includes the auth header
    const authHeader = getAuthorizationHeader()
    const customFetch = authHeader
      ? ((async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
          const request = new Request(input, init)
          request.headers.set("Authorization", authHeader)
          return fetch(request)
        }) as typeof fetch)
      : undefined

    await tui({
      url: args.url,
      args: { sessionID: args.session },
      directory,
      fetch: customFetch,
    })
  },
})
