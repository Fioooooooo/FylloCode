import { mkdirSync, writeFileSync, renameSync, rmSync } from "fs";
import { dirname } from "path";

let atomicWriteCounter = 0;

/**
 * 同步原子写：先写临时文件再 rename 覆盖目标。
 *
 * 这些 store 的读改写全程同步、无 await，因此不存在并发交错（Node 单线程下
 * 同步函数运行到底），无需写锁。真正的风险是 writeFileSync 写到一半被中断
 * （断电、进程被杀）留下截断的损坏文件——rename 在同一文件系统上是原子的，
 * 可保证目标文件要么是旧内容、要么是完整新内容，不会出现半截 JSON。
 */
export function writeFileAtomicSync(filePath: string, content: string): void {
  mkdirSync(dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${atomicWriteCounter}.tmp`;
  atomicWriteCounter += 1;
  try {
    writeFileSync(tempPath, content, "utf8");
    renameSync(tempPath, filePath);
  } catch (error) {
    rmSync(tempPath, { force: true });
    throw error;
  }
}
