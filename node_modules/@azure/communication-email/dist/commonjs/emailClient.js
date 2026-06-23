"use strict";
// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmailClient = void 0;
const core_auth_1 = require("@azure/core-auth");
const communication_common_1 = require("@azure/communication-common");
const emailRestApiClient_js_1 = require("./generated/src/emailRestApiClient.js");
const logger_js_1 = require("./logger.js");
/**
 * Checks whether the type of a value is EmailClientOptions or not.
 *
 * @param options - The value being checked.
 */
const isEmailClientOptions = (options) => !!options && !(0, core_auth_1.isTokenCredential)(options) && !(0, communication_common_1.isKeyCredential)(options);
/**
 *  The Email service client.
 */
class EmailClient {
    generatedClient;
    constructor(connectionStringOrUrl, credentialOrOptions, maybeOptions = {}) {
        const { url, credential } = (0, communication_common_1.parseClientArguments)(connectionStringOrUrl, credentialOrOptions);
        const options = isEmailClientOptions(credentialOrOptions) ? credentialOrOptions : maybeOptions;
        const internalPipelineOptions = {
            ...options,
            ...{
                loggingOptions: {
                    logger: logger_js_1.logger.info,
                },
            },
        };
        const authPolicy = (0, communication_common_1.createCommunicationAuthPolicy)(credential);
        this.generatedClient = new emailRestApiClient_js_1.EmailRestApiClient(url, internalPipelineOptions);
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
exports.EmailClient = EmailClient;
//# sourceMappingURL=emailClient.js.map