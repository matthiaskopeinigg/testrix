import {
  nextPlantumlId,
  seqActivate,
  seqAlt,
  seqDeactivate,
  seqDivider,
  seqElse,
  seqEnd,
  seqLoop,
  seqMsg,
  seqNote,
  type ActivityModel,
  type ClassModel,
  type PlantumlKind,
  type PlantumlModel,
  type SequenceModel,
  type SequenceParticipant,
} from './plantuml-generator';

export interface PlantumlTemplate {
  readonly id: string;
  readonly kind: Exclude<PlantumlKind, 'freeform'>;
  readonly label: string;
  readonly description: string;
  readonly create: () => PlantumlModel;
}

function p(
  name: string,
  alias: string,
  color?: string,
  role?: SequenceParticipant['role'],
): SequenceParticipant {
  return { id: nextPlantumlId('p'), name, alias, color, role };
}

export const PLANTUML_TEMPLATES: readonly PlantumlTemplate[] = [
  {
    id: 'sequence-device-approval',
    kind: 'sequence',
    label: 'Device approval',
    description: 'Push, approve, verify code, callback with alt/note',
    create: (): SequenceModel => {
      const user = p('User', 'user', undefined, 'actor');
      const mobile = p('Mobile App', 'mobile', '#magenta');
      const mobilebff = p('Mobile BFF', 'mobilebff', '#magenta');
      const auth = p('Auth Service', 'auth', '#LightGreen');
      const gateway = p('Identity Gateway', 'gateway', '#LightGreen');
      const push = p('Push', 'push');
      return {
        kind: 'sequence',
        title: 'Device Approval',
        autonumber: true,
        hideFootbox: true,
        participants: [user, mobile, mobilebff, auth, gateway, push],
        steps: [
          seqDivider('Notify Device'),
          seqMsg('auth', '->', 'push', 'push pending approval'),
          seqActivate('push'),
          seqMsg('push', '->', 'mobile', 'notification'),
          seqDeactivate('push'),
          seqDivider('Open and Approve'),
          seqMsg('user', '->', 'mobile', 'open app'),
          seqActivate('mobile'),
          seqMsg('mobile', '->', 'mobilebff', 'GET pending requests'),
          seqActivate('mobilebff'),
          seqMsg('mobilebff', '->', 'auth', 'GET /auth-requests?status=PENDING'),
          seqMsg('auth', '-->', 'mobilebff', 'list'),
          seqMsg('mobilebff', '-->', 'mobile', 'show request'),
          seqDeactivate('mobilebff'),
          seqMsg('user', '->', 'mobile', 'approve'),
          seqMsg('mobile', '->', 'mobilebff', 'POST approve'),
          seqActivate('mobilebff'),
          seqMsg('mobilebff', '->', 'auth', 'POST /device-verification'),
          seqMsg('auth', '->', 'auth', 'DEVICE_APPROVED = true'),
          seqMsg('auth', '-->', 'mobilebff', 'ok'),
          seqMsg('mobilebff', '-->', 'mobile', 'enter code'),
          seqDeactivate('mobilebff'),
          seqDivider('Verify Code'),
          seqMsg('user', '->', 'mobile', 'enter user_code'),
          seqMsg('mobile', '->', 'mobilebff', 'verify code'),
          seqActivate('mobilebff'),
          seqMsg('mobilebff', '->', 'auth', 'POST /auth-requests/{id}/verify-code'),
          seqActivate('auth'),
          seqMsg('auth', '->', 'auth', 'CODE_VERIFIED = true'),
          seqAlt('code valid and device approved'),
          seqMsg('auth', '->', 'gateway', 'callbackURL'),
          seqActivate('gateway'),
          seqMsg('gateway', '-->', 'auth', 'token ready'),
          seqDeactivate('gateway'),
          seqMsg('auth', '-->', 'mobilebff', 'verified'),
          seqMsg('mobilebff', '-->', 'mobile', 'success'),
          seqMsg('mobile', '-->', 'user', 'done'),
          seqElse('invalid / expired'),
          seqMsg('auth', '-->', 'mobilebff', 'error'),
          seqMsg('mobilebff', '-->', 'mobile', 'error'),
          seqMsg('mobile', '-->', 'user', 'try again'),
          seqEnd(),
          seqDeactivate('auth'),
          seqDeactivate('mobilebff'),
          seqDeactivate('mobile'),
        ],
      };
    },
  },
  {
    id: 'sequence-token-polling',
    kind: 'sequence',
    label: 'Token polling',
    description: 'Loop + alt until token, deny, or timeout',
    create: (): SequenceModel => {
      const webbff = p('Web BFF', 'webbff', '#magenta');
      const gateway = p('Identity Gateway', 'gateway', '#magenta');
      const auth = p('Auth Service', 'auth', '#LightGreen');
      return {
        kind: 'sequence',
        title: 'Token Polling',
        autonumber: true,
        hideFootbox: true,
        participants: [webbff, gateway, auth],
        steps: [
          seqNote('webbff,gateway', 'Client polls until the async\nauth request completes.'),
          seqLoop('every 5s [until token, deny, or timeout]'),
          seqMsg('webbff', '->', 'gateway', 'POST /token\\n(auth_req_id)'),
          seqAlt('authorization_pending'),
          seqMsg('gateway', '-->', 'webbff', '401 authorization_pending'),
          seqElse('token issued'),
          seqMsg('gateway', '-->', 'webbff', '200 + access_token'),
          seqElse('denied / expired / error'),
          seqMsg('gateway', '-->', 'webbff', 'error'),
          seqEnd(),
          seqEnd(),
          seqAlt('success'),
          seqMsg('webbff', '->', 'auth', 'optional introspect'),
          seqMsg('auth', '-->', 'webbff', 'claims'),
          seqElse('failure'),
          seqNote('webbff', 'Surface timeout or deny\nto the user.'),
          seqEnd(),
        ],
      };
    },
  },
  {
    id: 'sequence-checkout',
    kind: 'sequence',
    label: 'Checkout happy path',
    description: 'Cart, reserve, charge, confirm with alt paths',
    create: (): SequenceModel => {
      const customer = p('Customer', 'customer', undefined, 'actor');
      const store = p('Storefront', 'store', '#magenta');
      const cart = p('Cart', 'cart', '#LightGreen');
      const stock = p('Inventory', 'stock', '#LightGreen');
      const pay = p('Payments', 'pay', '#LightGreen');
      const orders = p('Orders', 'orders', '#LightBlue');
      return {
        kind: 'sequence',
        title: 'Checkout happy path',
        autonumber: true,
        hideFootbox: true,
        participants: [customer, store, cart, stock, pay, orders],
        steps: [
          seqMsg('customer', '->', 'store', 'start checkout'),
          seqActivate('store'),
          seqMsg('store', '->', 'cart', 'get cart'),
          seqMsg('cart', '-->', 'store', 'line items'),
          seqMsg('store', '->', 'stock', 'reserve items'),
          seqAlt('items available'),
          seqMsg('stock', '-->', 'store', 'reserved'),
          seqMsg('store', '->', 'pay', 'charge'),
          seqAlt('payment ok'),
          seqMsg('pay', '-->', 'store', 'receipt'),
          seqMsg('store', '->', 'orders', 'create order'),
          seqMsg('orders', '-->', 'store', 'order id'),
          seqMsg('store', '-->', 'customer', 'confirmation'),
          seqElse('payment failed'),
          seqMsg('pay', '-->', 'store', 'declined'),
          seqMsg('store', '->', 'stock', 'release reserve'),
          seqMsg('store', '-->', 'customer', 'try again'),
          seqEnd(),
          seqElse('out of stock'),
          seqMsg('stock', '-->', 'store', 'unavailable'),
          seqMsg('store', '-->', 'customer', 'update cart'),
          seqEnd(),
          seqDeactivate('store'),
        ],
      };
    },
  },
  {
    id: 'sequence-webhook-retry',
    kind: 'sequence',
    label: 'Webhook retry',
    description: 'Loop delivery with alt success/fail and dead-letter',
    create: (): SequenceModel => {
      const pub = p('Publisher', 'pub', '#magenta');
      const queue = p('Queue', 'q', '#magenta');
      const worker = p('Worker', 'w', '#LightGreen');
      const sub = p('Subscriber', 'sub', '#LightGreen');
      const dlq = p('Dead letter', 'dlq', '#LightBlue');
      return {
        kind: 'sequence',
        title: 'Webhook retry',
        autonumber: true,
        hideFootbox: true,
        participants: [pub, queue, worker, sub, dlq],
        steps: [
          seqMsg('pub', '->', 'q', 'enqueue event'),
          seqActivate('q'),
          seqLoop('until ack or max attempts'),
          seqMsg('q', '->', 'w', 'deliver'),
          seqActivate('w'),
          seqMsg('w', '->', 'sub', 'POST /hooks'),
          seqAlt('2xx'),
          seqMsg('sub', '-->', 'w', '200'),
          seqMsg('w', '-->', 'q', 'ack'),
          seqElse('5xx / timeout'),
          seqMsg('sub', '-->', 'w', 'error'),
          seqMsg('w', '-->', 'q', 'nack + backoff'),
          seqEnd(),
          seqDeactivate('w'),
          seqEnd(),
          seqAlt('max attempts exceeded'),
          seqMsg('q', '->', 'dlq', 'park event'),
          seqEnd(),
          seqDeactivate('q'),
        ],
      };
    },
  },
  {
    id: 'sequence-login',
    kind: 'sequence',
    label: 'Login sequence',
    description: 'Client, API, Auth, and profile',
    create: (): SequenceModel => {
      const client = p('Client', 'Client', '#magenta');
      const api = p('API', 'API', '#magenta');
      const auth = p('Auth', 'Auth', '#LightGreen');
      const profile = p('Profile', 'Profile', '#LightBlue');
      return {
        kind: 'sequence',
        title: 'Login',
        autonumber: true,
        hideFootbox: true,
        participants: [client, api, auth, profile],
        steps: [
          seqMsg('Client', '->', 'API', 'POST /login'),
          seqMsg('API', '->', 'Auth', 'verify credentials'),
          seqMsg('Auth', '-->', 'API', 'token'),
          seqMsg('API', '->', 'Profile', 'load user'),
          seqMsg('Profile', '-->', 'API', 'user record'),
          seqMsg('API', '-->', 'Client', '200 + JWT'),
        ],
      };
    },
  },
  {
    id: 'sequence-password-reset',
    kind: 'sequence',
    label: 'Password reset',
    description: 'Request, email, verify, update',
    create: (): SequenceModel => {
      const user = p('User', 'User', undefined, 'actor');
      const app = p('App', 'App', '#magenta');
      const auth = p('Auth', 'Auth', '#LightGreen');
      const mail = p('Mailer', 'Mailer', '#LightBlue');
      return {
        kind: 'sequence',
        title: 'Password reset',
        autonumber: true,
        hideFootbox: true,
        participants: [user, app, auth, mail],
        steps: [
          seqMsg('User', '->', 'App', 'request reset'),
          seqMsg('App', '->', 'Auth', 'create reset token'),
          seqMsg('Auth', '-->', 'App', 'token'),
          seqMsg('App', '->', 'Mailer', 'send reset link'),
          seqMsg('Mailer', '->>', 'User', 'email'),
          seqMsg('User', '->', 'App', 'open link + new password'),
          seqMsg('App', '->', 'Auth', 'verify token + update'),
          seqMsg('Auth', '-->', 'App', 'ok'),
          seqMsg('App', '-->', 'User', 'password updated'),
        ],
      };
    },
  },
  {
    id: 'sequence-file-upload',
    kind: 'sequence',
    label: 'File upload',
    description: 'Presign, upload, confirm, process',
    create: (): SequenceModel => {
      const client = p('Client', 'Client', '#magenta');
      const api = p('API', 'API', '#magenta');
      const storage = p('Storage', 'Storage', '#LightGreen');
      const worker = p('Processor', 'Processor', '#LightBlue');
      return {
        kind: 'sequence',
        title: 'File upload',
        autonumber: true,
        hideFootbox: true,
        participants: [client, api, storage, worker],
        steps: [
          seqMsg('Client', '->', 'API', 'request upload'),
          seqMsg('API', '->', 'Storage', 'create presigned URL'),
          seqMsg('Storage', '-->', 'API', 'url + object key'),
          seqMsg('API', '-->', 'Client', 'presigned URL'),
          seqMsg('Client', '->', 'Storage', 'PUT bytes'),
          seqMsg('Storage', '-->', 'Client', '201'),
          seqMsg('Client', '->', 'API', 'confirm upload'),
          seqMsg('API', '->>', 'Processor', 'enqueue job'),
          seqMsg('API', '-->', 'Client', 'accepted'),
        ],
      };
    },
  },
  {
    id: 'class-domain',
    kind: 'class',
    label: 'Domain model',
    description: 'Entity, repository, and service',
    create: (): ClassModel => ({
      kind: 'class',
      title: 'Domain model',
      classes: [
        {
          id: nextPlantumlId('c'),
          name: 'Order',
          stereotype: 'entity',
          members: '+id: string\n+status: string\n+total: number',
        },
        {
          id: nextPlantumlId('c'),
          name: 'OrderLine',
          stereotype: 'entity',
          members: '+sku: string\n+qty: number\n+price: number',
        },
        {
          id: nextPlantumlId('c'),
          name: 'OrderRepository',
          stereotype: 'repository',
          members: '+findById(id)\n+save(order)\n+delete(id)',
        },
        {
          id: nextPlantumlId('c'),
          name: 'OrderService',
          stereotype: 'service',
          members: '+create(dto)\n+update(id, dto)\n+cancel(id)',
        },
      ],
      relations: [
        { id: nextPlantumlId('r'), from: 'Order', to: 'OrderLine', kind: 'composition', label: 'has' },
        { id: nextPlantumlId('r'), from: 'OrderService', to: 'OrderRepository', kind: 'association', label: 'uses' },
        { id: nextPlantumlId('r'), from: 'OrderRepository', to: 'Order', kind: 'association', label: 'persists' },
      ],
    }),
  },
  {
    id: 'class-billing',
    kind: 'class',
    label: 'Billing types',
    description: 'Invoice, payment, and gateway ports',
    create: (): ClassModel => ({
      kind: 'class',
      title: 'Billing types',
      classes: [
        {
          id: nextPlantumlId('c'),
          name: 'Invoice',
          stereotype: 'entity',
          members: '+id: string\n+amount: number\n+dueAt: Date\n+status: string',
        },
        {
          id: nextPlantumlId('c'),
          name: 'Payment',
          stereotype: 'entity',
          members: '+id: string\n+invoiceId: string\n+method: string\n+capturedAt: Date',
        },
        {
          id: nextPlantumlId('c'),
          name: 'PaymentGateway',
          stereotype: 'port',
          members: '+charge(invoice)\n+refund(payment)\n+status(id)',
        },
        {
          id: nextPlantumlId('c'),
          name: 'BillingService',
          stereotype: 'service',
          members: '+issue(invoice)\n+capture(payment)\n+void(invoice)',
        },
        {
          id: nextPlantumlId('c'),
          name: 'StripeGateway',
          stereotype: 'adapter',
          members: '+charge(invoice)\n+refund(payment)',
        },
      ],
      relations: [
        { id: nextPlantumlId('r'), from: 'Invoice', to: 'Payment', kind: 'aggregation', label: 'paid by' },
        { id: nextPlantumlId('r'), from: 'BillingService', to: 'PaymentGateway', kind: 'association', label: 'uses' },
        { id: nextPlantumlId('r'), from: 'StripeGateway', to: 'PaymentGateway', kind: 'implements', label: '' },
        { id: nextPlantumlId('r'), from: 'BillingService', to: 'Invoice', kind: 'association', label: 'manages' },
      ],
    }),
  },
  {
    id: 'activity-onboarding',
    kind: 'activity',
    label: 'Onboarding steps',
    description: 'Welcome, profile, and confirm',
    create: (): ActivityModel => ({
      kind: 'activity',
      title: 'Onboarding steps',
      steps: [
        { id: nextPlantumlId('a'), label: '', kind: 'start' },
        { id: nextPlantumlId('a'), label: 'Welcome', kind: 'action' },
        { id: nextPlantumlId('a'), label: 'Profile complete?', kind: 'if' },
        { id: nextPlantumlId('a'), label: 'Collect details', kind: 'action' },
        { id: nextPlantumlId('a'), label: 'Save profile', kind: 'action' },
        { id: nextPlantumlId('a'), label: '', kind: 'endif' },
        { id: nextPlantumlId('a'), label: 'Show home', kind: 'action' },
        { id: nextPlantumlId('a'), label: '', kind: 'stop' },
      ],
    }),
  },
  {
    id: 'activity-fulfillment',
    kind: 'activity',
    label: 'Order fulfillment',
    description: 'Validate, pick, pack, ship',
    create: (): ActivityModel => ({
      kind: 'activity',
      title: 'Order fulfillment',
      steps: [
        { id: nextPlantumlId('a'), label: '', kind: 'start' },
        { id: nextPlantumlId('a'), label: 'Receive order', kind: 'action' },
        { id: nextPlantumlId('a'), label: 'Stock available?', kind: 'if' },
        { id: nextPlantumlId('a'), label: 'Allocate inventory', kind: 'action' },
        { id: nextPlantumlId('a'), label: '', kind: 'fork' },
        { id: nextPlantumlId('a'), label: 'Print packing slip', kind: 'action' },
        { id: nextPlantumlId('a'), label: 'Pick items', kind: 'action' },
        { id: nextPlantumlId('a'), label: '', kind: 'endfork' },
        { id: nextPlantumlId('a'), label: 'Pack box', kind: 'action' },
        { id: nextPlantumlId('a'), label: 'Hand off to carrier', kind: 'action' },
        { id: nextPlantumlId('a'), label: 'Notify customer', kind: 'action' },
        { id: nextPlantumlId('a'), label: '', kind: 'endif' },
        { id: nextPlantumlId('a'), label: 'Mark fulfilled', kind: 'action' },
        { id: nextPlantumlId('a'), label: '', kind: 'stop' },
      ],
    }),
  },
];

export function templatesForKind(kind: Exclude<PlantumlKind, 'freeform'>): readonly PlantumlTemplate[] {
  return PLANTUML_TEMPLATES.filter((item) => item.kind === kind);
}
