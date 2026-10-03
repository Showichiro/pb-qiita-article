// Compile-only RPC evaluation. No runtime import of the server enters the islands.
import type { hc, InferRequestType, InferResponseType } from "hono/client";
import type { AppType } from "./index";
import type {
  Article,
  TimeSeriesResponse,
  DataVersionResponse,
} from "./schemas";

type Client = ReturnType<typeof hc<AppType>>;
type Assert<T extends true> = T;
type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;

export type ArticlesResponseContract = Assert<
  Equal<InferResponseType<Client["api"]["articles"]["$get"], 200>, Article[]>
>;
export type AnalysisResponseContract = Assert<
  Equal<
    InferResponseType<Client["api"]["analysis"]["time-series"]["$get"], 200>,
    TimeSeriesResponse
  >
>;
export type VersionResponseContract = Assert<
  Equal<
    InferResponseType<Client["api"]["data-version"]["$get"], 200>,
    DataVersionResponse
  >
>;
type ArticleRequest = InferRequestType<Client["api"]["articles"]["$get"]>;
export const rpcRequestExample = {
  query: {
    q: undefined,
    author: undefined,
    offset: 0,
    limit: 10,
    tags: ["react", "TypeScript"],
  },
} satisfies ArticleRequest;
export const invalidRpcQuery = {
  // @ts-expect-error Query parameter names remain constrained by the shared route.
  query: { unknownFilter: "value" },
} satisfies ArticleRequest;
