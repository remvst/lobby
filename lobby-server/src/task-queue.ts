import { createLogger } from "bunyan";
import { TaskParams } from "./task-params";

type Executor<PayloadType> = (payload: PayloadType) => Promise<void> | void;

export default class TaskQueue {

    private readonly logger = createLogger({name: `lobby-server`});
    private readonly executors = new Map<string, Executor<any>>();

    schedule(params: TaskParams) {
        this.logger.info('Scheduling', { params });

        const now = Date.now();
        const delay = params.scheduledTime - now;
        setTimeout(() => this.executeTask(params), delay);
    }

    executeTask(task: TaskParams) {
        this.logger.info('Executing', { task });

        const executor = this.executors.get(task.type);

        (async () => {
            try {
                await executor(task.payload);
            } catch (err) {
                this.logger.info('Failed', { task, err });
            }
        })();
    }

    defineExecutor<PayloadType>(taskType: string, executor: Executor<PayloadType>) {
        this.executors.set(taskType, executor);
    }
}
