import { Provider, Injectable } from '@opensumi/common-di';
import { NodeModule } from '@opensumi/ide-core-node';

@Injectable()
export class TaskModule extends NodeModule {
  providers: Provider[] = [];
}
