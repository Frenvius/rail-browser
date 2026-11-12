import type {ShellState} from '~/spaces';
import type {CdpConnection, CdpTargetInfo, McpContext} from '~/upstream';

export interface ShellWindow {
  target: CdpTargetInfo;
  state: ShellState;
}

const SHELL_TARGET_TYPE = 'browser_ui';
const SHELL_URL = 'chrome://webui-browser/';

const READ_STATE = `(async () => {
  const automation = window.railAutomation;
  if (!automation) {
    return null;
  }
  return {spaces: automation.spaces(), tabs: await automation.tabs()};
})()`;

async function evaluate<T>(
    connection: CdpConnection, target: CdpTargetInfo,
    expression: string): Promise<T> {
  const session = await connection.createSession(target);
  try {
    const {result, exceptionDetails} = await session.send(
        'Runtime.evaluate',
        {expression, awaitPromise: true, returnByValue: true});
    if (exceptionDetails) {
      throw new Error(
          exceptionDetails.exception?.description ?? exceptionDetails.text);
    }
    return result.value;
  } finally {
    await session.detach();
  }
}

export async function readWindows(context: McpContext):
    Promise<ShellWindow[]> {
  const connection = (await context.ensureBrowser())._connection;
  const {targetInfos} =
      await connection.send('Target.getTargets', {filter: [{}]});
  const shells = (targetInfos as CdpTargetInfo[])
                     .filter(
                         target => target.type === SHELL_TARGET_TYPE &&
                             target.url === SHELL_URL);
  const states = await Promise.all(shells.map(
      target => evaluate<ShellState|null>(connection, target, READ_STATE)));
  return shells.flatMap((target, index) => {
    const state = states[index];
    return state ? [{target, state}] : [];
  });
}

export async function openTab(
    context: McpContext, window: ShellWindow, spaceId: string): Promise<string> {
  const connection = (await context.ensureBrowser())._connection;
  return evaluate<string>(
      connection, window.target,
      `window.railAutomation.open(${JSON.stringify(spaceId)}, 'about:blank')`);
}

export async function selectSpace(
    context: McpContext, window: ShellWindow,
    spaceId: string): Promise<boolean> {
  const connection = (await context.ensureBrowser())._connection;
  return evaluate<boolean>(
      connection, window.target,
      `window.railAutomation.select?.(${JSON.stringify(spaceId)}) ?? false`);
}
