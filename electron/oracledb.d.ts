declare module 'oracledb' {
  export const OUT_FORMAT_OBJECT: number;
  export const CLOB: number;
  export let outFormat: number;
  export let fetchAsString: number[];

  export interface Pool {
    getConnection(): Promise<Connection>;
    close(drainTime?: number): Promise<void>;
  }

  export interface Connection {
    execute(
      sql: string,
      binds?: unknown[],
      options?: {
        readonly outFormat?: number;
        readonly autoCommit?: boolean;
      },
    ): Promise<Result>;
    close(): Promise<void>;
  }

  export interface Result {
    readonly rows?: unknown[];
    readonly rowsAffected?: number;
    readonly metaData?: readonly { readonly dbTypeName?: string }[];
  }

  export function initOracleClient(options?: {
    readonly libDir?: string;
    readonly configDir?: string;
  }): void;
  export let thin: boolean;

  export function createPool(options: {
    readonly user?: string;
    readonly password?: string;
    readonly connectString?: string;
    readonly poolMin?: number;
    readonly poolMax?: number;
    readonly poolIncrement?: number;
    readonly connectTimeout?: number;
  }): Promise<Pool>;

  const oracledb: {
    OUT_FORMAT_OBJECT: number;
    CLOB: number;
    outFormat: number;
    fetchAsString: number[];
    thin: boolean;
    initOracleClient: typeof initOracleClient;
    createPool: typeof createPool;
  };

  export default oracledb;
}
