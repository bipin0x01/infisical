import crypto from "crypto";

import { FormEvent, useState } from "react";
import { faCheck, faX } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import jsrp from "jsrp";

import InputField from "@app/components/basic/InputField";
import passwordCheck from "@app/components/utilities/checks/password/PasswordCheck";
import Aes256Gcm from "@app/components/utilities/cryptography/aes-256-gcm";
import { deriveArgonKey } from "@app/components/utilities/cryptography/crypto";
import { Button } from "@app/components/v2";
import { useResetPassword, useVerifyPasswordResetCode } from "@app/hooks/api";
import { getBackupEncryptedPrivateKey } from "@app/hooks/api/auth/queries";

// eslint-disable-next-line new-cap
const client = new jsrp.client();

const PasswordResetPage = () => {
  const [verificationToken, setVerificationToken] = useState("");
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [backupKey, setBackupKey] = useState("");
  const [privateKey, setPrivateKey] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [backupKeyError, setBackupKeyError] = useState(false);
  const [passwordErrorTooShort, setPasswordErrorTooShort] = useState(false);
  const [passwordErrorTooLong, setPasswordErrorTooLong] = useState(false);
  const [passwordErrorNoLetterChar, setPasswordErrorNoLetterChar] = useState(false);
  const [passwordErrorNoNumOrSpecialChar, setPasswordErrorNoNumOrSpecialChar] = useState(false);
  const [passwordErrorRepeatedChar, setPasswordErrorRepeatedChar] = useState(false);
  const [passwordErrorEscapeChar, setPasswordErrorEscapeChar] = useState(false);
  const [passwordErrorLowEntropy, setPasswordErrorLowEntropy] = useState(false);
  const [passwordErrorBreached, setPasswordErrorBreached] = useState(false);

  const navigate = useNavigate();
  const search = useSearch({ from: "/_restrict_login_signup/password-reset" });

  const {
    mutateAsync: verifyPasswordResetCodeMutateAsync,
    isLoading: isVerifyPasswordResetLoading
  } = useVerifyPasswordResetCode();
  const { mutateAsync: resetPasswordMutateAsync } = useResetPassword();

  const parsedUrl = search;
  const token = parsedUrl.token as string;
  const email = (parsedUrl.to as string)?.replace(" ", "+").trim();

  // Decrypt the private key with a backup key
  const getEncryptedKeyHandler = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    try {
      const result = await getBackupEncryptedPrivateKey({ verificationToken });

      setPrivateKey(
        Aes256Gcm.decrypt({
          ciphertext: result.encryptedPrivateKey,
          iv: result.iv,
          tag: result.tag,
          secret: backupKey
        })
      );
      setStep(3);
    } catch (err) {
      console.error(err);
      setBackupKeyError(true);
    }
  };

  // If everything is correct, reset the password
  const resetPasswordHandler = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const errorCheck = await passwordCheck({
      password: newPassword,
      setPasswordErrorTooShort,
      setPasswordErrorTooLong,
      setPasswordErrorNoLetterChar,
      setPasswordErrorNoNumOrSpecialChar,
      setPasswordErrorRepeatedChar,
      setPasswordErrorEscapeChar,
      setPasswordErrorLowEntropy,
      setPasswordErrorBreached
    });

    if (!errorCheck) {
      client.init(
        {
          username: email,
          password: newPassword
        },
        async () => {
          client.createVerifier(async (_err: any, result: { salt: string; verifier: string }) => {
            const derivedKey = await deriveArgonKey({
              password: newPassword,
              salt: result.salt,
              mem: 65536,
              time: 3,
              parallelism: 1,
              hashLen: 32
            });

            if (!derivedKey) throw new Error("Failed to derive key from password");

            const key = crypto.randomBytes(32);

            // create encrypted private key by encrypting the private
            // key with the symmetric key [key]
            const {
              ciphertext: encryptedPrivateKey,
              iv: encryptedPrivateKeyIV,
              tag: encryptedPrivateKeyTag
            } = Aes256Gcm.encrypt({
              text: privateKey,
              secret: key
            });

            // create the protected key by encrypting the symmetric key
            // [key] with the derived key
            const {
              ciphertext: protectedKey,
              iv: protectedKeyIV,
              tag: protectedKeyTag
            } = Aes256Gcm.encrypt({
              text: key.toString("hex"),
              secret: Buffer.from(derivedKey.hash)
            });

            await resetPasswordMutateAsync({
              protectedKey,
              protectedKeyIV,
              protectedKeyTag,
              encryptedPrivateKey,
              encryptedPrivateKeyIV,
              encryptedPrivateKeyTag,
              salt: result.salt,
              verifier: result.verifier,
              verificationToken
            });

            navigate({ to: "/login" });

            setLoading(false);
          });
        }
      );
    }
  };

  // Click a button to confirm email
  const stepConfirmEmail = (
    <div className="mx-1 my-32 flex w-full max-w-xs flex-col items-center rounded-xl bg-bunker px-4 py-6 drop-shadow-xl md:max-w-lg md:px-6">
      <p className="mb-8 flex justify-center bg-gradient-to-br from-sky-400 to-primary bg-clip-text text-center text-4xl font-semibold text-transparent">
        Confirm your email
      </p>
      <img src="/images/envelope.svg" height={262} width={410} alt="verify email" />
      <div className="mx-auto mb-2 mt-4 flex max-h-24 max-w-md flex-col items-center justify-center px-4 text-lg md:p-2">
        <Button
          onClick={async () => {
            try {
              const response = await verifyPasswordResetCodeMutateAsync({
                email,
                code: token
              });

              setVerificationToken(response.token);
              setStep(2);
            } catch (err) {
              console.log("ERROR", err);
              navigate({ to: "/email-not-verified" });
            }
          }}
          isLoading={isVerifyPasswordResetLoading}
          size="lg"
        >
          Confirm Email
        </Button>
      </div>
    </div>
  );

  // Input backup key
  const stepInputBackupKey = (
    <form
      onSubmit={getEncryptedKeyHandler}
      className="mx-1 my-32 flex w-full max-w-xs flex-col items-center rounded-xl bg-bunker px-4 pb-3 pt-6 drop-shadow-xl md:max-w-lg md:px-6"
    >
      <p className="mx-auto mb-4 flex w-max justify-center text-2xl font-semibold text-bunker-100 md:text-3xl">
        Enter your backup key
      </p>
      <div className="mt-4 flex flex-row items-center justify-center md:mx-2 md:pb-4">
        <p className="flex w-max max-w-md justify-center text-sm text-gray-400">
          You can find it in your emergency kit. You had to download the emergency kit during
          signup.
        </p>
      </div>
      <div className="mt-4 flex max-h-24 w-full items-center justify-center rounded-lg md:mt-0 md:max-h-28 md:p-2">
        <InputField
          label="Backup Key"
          onChangeHandler={setBackupKey}
          type="password"
          value={backupKey}
          placeholder=""
          isRequired
          error={backupKeyError}
          errorText="Something is wrong with the backup key"
        />
      </div>
      <div className="mx-auto mt-4 flex max-h-20 w-full max-w-md flex-col items-center justify-center text-sm md:p-2">
        <div className="text-l m-8 mt-6 px-8 py-3 text-lg">
          <Button type="submit" size="lg">
            Submit Backup Key
          </Button>
        </div>
      </div>
    </form>
  );

  // Enter new password
  const stepEnterNewPassword = (
    <form
      onSubmit={resetPasswordHandler}
      className="mx-1 my-32 flex w-full max-w-xs flex-col items-center rounded-xl bg-bunker px-4 pb-3 pt-6 drop-shadow-xl md:max-w-lg md:px-6"
    >
      <p className="mx-auto flex w-max justify-center text-2xl font-semibold text-bunker-100 md:text-3xl">
        Enter new password
      </p>
      <div className="mt-1 flex flex-row items-center justify-center md:mx-2 md:pb-4">
        <p className="flex w-max max-w-md justify-center text-sm text-gray-400">
          Make sure you save it somewhere safe.
        </p>
      </div>
      <div className="mt-4 flex max-h-24 w-full items-center justify-center rounded-lg md:mt-0 md:max-h-28 md:p-2">
        <InputField
          label="New Password"
          onChangeHandler={(password) => {
            setNewPassword(password);
            passwordCheck({
              password,
              setPasswordErrorTooShort,
              setPasswordErrorTooLong,
              setPasswordErrorNoLetterChar,
              setPasswordErrorNoNumOrSpecialChar,
              setPasswordErrorRepeatedChar,
              setPasswordErrorEscapeChar,
              setPasswordErrorLowEntropy,
              setPasswordErrorBreached
            });
          }}
          type="password"
          value={newPassword}
          isRequired
          error={
            passwordErrorTooShort &&
            passwordErrorTooLong &&
            passwordErrorNoLetterChar &&
            passwordErrorNoNumOrSpecialChar &&
            passwordErrorRepeatedChar &&
            passwordErrorEscapeChar &&
            passwordErrorLowEntropy &&
            passwordErrorBreached
          }
          autoComplete="new-password"
          id="new-password"
        />
      </div>
      {passwordErrorTooShort ||
      passwordErrorTooLong ||
      passwordErrorNoLetterChar ||
      passwordErrorNoNumOrSpecialChar ||
      passwordErrorRepeatedChar ||
      passwordErrorEscapeChar ||
      passwordErrorLowEntropy ||
      passwordErrorBreached ? (
        <div className="mx-2 mb-2 mt-3 flex w-full max-w-md flex-col items-start rounded-md bg-white/5 px-2 py-2">
          <div className="mb-1 text-sm text-gray-400">Password should contain:</div>
          <div className="ml-1 flex flex-row items-center justify-start">
            {passwordErrorTooShort ? (
              <FontAwesomeIcon icon={faX} className="text-md mr-2.5 text-red" />
            ) : (
              <FontAwesomeIcon icon={faCheck} className="text-md mr-2 text-primary" />
            )}
            <div className={`${passwordErrorTooShort ? "text-gray-400" : "text-gray-600"} text-sm`}>
              at least 14 characters
            </div>
          </div>
          <div className="ml-1 flex flex-row items-center justify-start">
            {passwordErrorTooLong ? (
              <FontAwesomeIcon icon={faX} className="text-md mr-2.5 text-red" />
            ) : (
              <FontAwesomeIcon icon={faCheck} className="text-md mr-2 text-primary" />
            )}
            <div className={`${passwordErrorTooLong ? "text-gray-400" : "text-gray-600"} text-sm`}>
              at most 100 characters
            </div>
          </div>
          <div className="ml-1 flex flex-row items-center justify-start">
            {passwordErrorNoLetterChar ? (
              <FontAwesomeIcon icon={faX} className="text-md mr-2.5 text-red" />
            ) : (
              <FontAwesomeIcon icon={faCheck} className="text-md mr-2 text-primary" />
            )}
            <div
              className={`${passwordErrorNoLetterChar ? "text-gray-400" : "text-gray-600"} text-sm`}
            >
              at least 1 letter character
            </div>
          </div>
          <div className="ml-1 flex flex-row items-center justify-start">
            {passwordErrorNoNumOrSpecialChar ? (
              <FontAwesomeIcon icon={faX} className="text-md mr-2.5 text-red" />
            ) : (
              <FontAwesomeIcon icon={faCheck} className="text-md mr-2 text-primary" />
            )}
            <div
              className={`${
                passwordErrorNoNumOrSpecialChar ? "text-gray-400" : "text-gray-600"
              } text-sm`}
            >
              at least 1 number or special character
            </div>
          </div>
          <div className="ml-1 flex flex-row items-center justify-start">
            {passwordErrorRepeatedChar ? (
              <FontAwesomeIcon icon={faX} className="text-md mr-2.5 text-red" />
            ) : (
              <FontAwesomeIcon icon={faCheck} className="text-md mr-2 text-primary" />
            )}
            <div
              className={`${passwordErrorRepeatedChar ? "text-gray-400" : "text-gray-600"} text-sm`}
            >
              at most 3 repeated, consecutive characters
            </div>
          </div>
          <div className="ml-1 flex flex-row items-center justify-start">
            {passwordErrorEscapeChar ? (
              <FontAwesomeIcon icon={faX} className="text-md mr-2.5 text-red" />
            ) : (
              <FontAwesomeIcon icon={faCheck} className="text-md mr-2 text-primary" />
            )}
            <div
              className={`${passwordErrorEscapeChar ? "text-gray-400" : "text-gray-600"} text-sm`}
            >
              No escape characters allowed.
            </div>
          </div>
          <div className="ml-1 flex flex-row items-center justify-start">
            {passwordErrorLowEntropy ? (
              <FontAwesomeIcon icon={faX} className="text-md mr-2.5 text-red" />
            ) : (
              <FontAwesomeIcon icon={faCheck} className="text-md mr-2 text-primary" />
            )}
            <div
              className={`${passwordErrorLowEntropy ? "text-gray-400" : "text-gray-600"} text-sm`}
            >
              Password contains personal info.
            </div>
          </div>
          <div className="ml-1 flex flex-row items-center justify-start">
            {passwordErrorBreached ? (
              <FontAwesomeIcon icon={faX} className="text-md mr-2.5 text-red" />
            ) : (
              <FontAwesomeIcon icon={faCheck} className="text-md mr-2 text-primary" />
            )}
            <div className={`${passwordErrorBreached ? "text-gray-400" : "text-gray-600"} text-sm`}>
              Password was found in a data breach.
            </div>
          </div>
        </div>
      ) : (
        <div className="py-2" />
      )}
      <div className="mx-auto mt-4 flex max-h-20 w-full max-w-md flex-col items-center justify-center text-sm md:p-2">
        <div className="text-l m-8 mt-6 px-8 py-3 text-lg">
          <Button type="submit" onClick={() => setLoading(true)} size="lg" isLoading={loading}>
            Submit New Password
          </Button>
        </div>
      </div>
    </form>
  );

  return (
    <div className="flex h-screen w-full flex-col items-center justify-center bg-bunker-800">
      {step === 1 && stepConfirmEmail}
      {step === 2 && stepInputBackupKey}
      {step === 3 && stepEnterNewPassword}
    </div>
  );
};

export const Route = createFileRoute("/_restrict_login_signup/password-reset")({
  component: PasswordResetPage
});
