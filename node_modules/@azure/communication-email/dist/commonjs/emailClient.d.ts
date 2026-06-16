import type { EmailClientOptions, EmailMessage, EmailSendOptionalParams } from "./models.js";
import type { KeyCredential, TokenCredential } from "@azure/core-auth";
import type { SimplePollerLike, OperationState } from "@azure/core-lro";
import type { EmailSendResponse } from "./generated/src/index.js";
/**
 *  The Email service client.
 */
export declare class EmailClient {
    private readonly generatedClient;
    /**
     * Initializes a new instance of the EmailClient class.
     * @param connectionString - Connection string to connect to an Azure Communication Service resource.
     *                         Example: "endpoint=https://contoso.eastus.communications.azure.net/;accesskey=secret";
     * @param options - Optional. Options to configure the HTTP pipeline.
     */
    constructor(connectionString: string, options?: EmailClientOptions);
    /**
     * Initializes a new instance of the EmailClient class using an Azure KeyCredential.
     * @param endpoint - The endpoint of the service (ex: https://contoso.eastus.communications.azure.net).
     * @param credential - An object that is used to authenticate requests to the service. Use the Azure KeyCredential or `@azure/identity` to create a credential.
     * @param options - Optional. Options to configure the HTTP pipeline.
     */
    constructor(endpoint: string, credential: KeyCredential | TokenCredential, options?: EmailClientOptions);
    /**
     * Queues an email message to be sent to one or more recipients
     * @param message - Message payload for sending an email
     * @param options - The options parameters.
     */
    beginSend(message: EmailMessage, options?: EmailSendOptionalParams): Promise<SimplePollerLike<OperationState<EmailSendResponse>, EmailSendResponse>>;
}
//# sourceMappingURL=emailClient.d.ts.map