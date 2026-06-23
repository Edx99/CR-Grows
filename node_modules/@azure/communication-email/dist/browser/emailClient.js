// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.
import { isTokenCredential } from "@azure/core-auth";
import { createCommunicationAuthPolicy, isKeyCredential, parseClientArguments, } from "@azure/communication-common";
import { EmailRestApiClient } from "./generated/src/emailRestApiClient.js";
import { logger } from "./logger.js";
/**
 * Checks whether the type of a value is EmailClientOptions or not.
 *
 * @param options - The value being checked.
 */
const isEmailClientOptions = (options) => !!options && !isTokenCredential(options) && !isKeyCredential(options);
/**
 *  The Email service client.
 */
export class EmailClient {
    generatedClient;
    constructor(connectionStringOrUrl, credentialOrOptions, maybeOptions = {}) {
        const { url, credential } = parseClientArguments(connectionStringOrUrl, credentialOrOptions);
        const options = isEmailClientOptions(credentialOrOptions) ? credentialOrOptions : maybeOptions;
        const internalPipelineOptions = {
            ...options,
            ...{
                loggingOptions: {
                    logger: logger.info,
                },
            },
        };
        const authPolicy = createCommunicationAuthPolicy(credential);
        this.generatedClient = new EmailRestApiClient(url, internalPipelineOptions);
        this.generatedClient.pipeline.addPolicy(authPolicy);
    }
    /**
     * Queues an email message to be sent to one or more recipients
     * @param message - Message payload for sending an email
     * @param options - The options parameters.
     */
    beginSend(message, options) {
        return this.generatedClient.email.beginSend(message, options);
    }
}
//# sourceMappingURL=emailClient.js.map