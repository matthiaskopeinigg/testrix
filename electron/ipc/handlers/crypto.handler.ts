import { ErrorCodes, TestrixError } from '../../../shared/errors';
import { rsaOaepCipherPayloadSchema } from '../../../shared/crypto/rsa-oaep.schema';
import { decryptBase64ToUtf8, encryptUtf8ToBase64 } from '../../services/crypto/rsa-oaep-cipher';
import { CryptoChannels } from '../channels/crypto.channels';
import type { IpcMainBinder } from '../register-ipc';
import { wrapInvokeHandler } from '../wrap-ipc-handler';

/**
 * Registers RSA OAEP encrypt/decrypt invoke handlers for Development Tools.
 */
export function registerCryptoHandlers(ipc: IpcMainBinder): void {
  ipc.handle(
    CryptoChannels.encrypt,
    wrapInvokeHandler(CryptoChannels.encrypt, async (_event, raw: unknown) => {
      const parsed = rsaOaepCipherPayloadSchema.safeParse({
        ...(typeof raw === 'object' && raw !== null ? raw : {}),
        mode: 'encrypt',
      });
      if (!parsed.success) {
        throw new TestrixError(ErrorCodes.CONFIG_VALIDATION_FAILED, 'Invalid RSA OAEP encrypt payload.');
      }
      try {
        const output = encryptUtf8ToBase64({
          pem: parsed.data.pem,
          keyPassword: parsed.data.keyPassword,
          plaintext: parsed.data.input,
        });
        return { output };
      } catch (error: unknown) {
        throw toCipherError(error);
      }
    }),
  );

  ipc.handle(
    CryptoChannels.decrypt,
    wrapInvokeHandler(CryptoChannels.decrypt, async (_event, raw: unknown) => {
      const parsed = rsaOaepCipherPayloadSchema.safeParse({
        ...(typeof raw === 'object' && raw !== null ? raw : {}),
        mode: 'decrypt',
      });
      if (!parsed.success) {
        throw new TestrixError(ErrorCodes.CONFIG_VALIDATION_FAILED, 'Invalid RSA OAEP decrypt payload.');
      }
      try {
        const output = decryptBase64ToUtf8({
          pem: parsed.data.pem,
          keyPassword: parsed.data.keyPassword,
          ciphertext: parsed.data.input,
        });
        return { output };
      } catch (error: unknown) {
        throw toCipherError(error);
      }
    }),
  );
}

function toCipherError(error: unknown): TestrixError {
  if (error instanceof TestrixError) {
    return error;
  }
  const message = error instanceof Error ? error.message : 'RSA OAEP operation failed.';
  return new TestrixError(ErrorCodes.IPC_HANDLER_FAILED, message);
}
