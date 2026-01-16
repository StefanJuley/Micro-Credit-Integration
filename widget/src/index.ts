import CreditWidget from './CreditWidget.vue';
import { createWidgetEndpoint } from '@retailcrm/embed-ui';
import { fromInsideIframe } from '@remote-ui/rpc';
import { useOrderCardContext as useOrder, useCurrentUserContext } from '@retailcrm/embed-ui';

createWidgetEndpoint(
  {
    async run(createApp, root, pinia) {
      const app = createApp(CreditWidget);
      app.use(pinia);

      await Promise.allSettled([
        useOrder().initialize(),
        useCurrentUserContext().initialize()
      ]);

      app.mount(root);

      return () => app.unmount();
    },
  },
  fromInsideIframe(),
);
