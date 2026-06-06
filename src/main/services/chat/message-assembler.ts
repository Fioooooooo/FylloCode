// Re-export from domain so ipc/ handlers can instantiate assemblers without
// importing the domain layer directly. The implementation lives in domain/
// because it is pure logic.
export { MessageAssembler } from "@main/domain/chat/message-assembler";
