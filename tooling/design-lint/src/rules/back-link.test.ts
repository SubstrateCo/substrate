import { ruleTester } from "../test-support.ts";
import { backLink } from "./back-link.ts";

ruleTester.run("back-link", backLink, {
  valid: [
    '<BackLink><Link to="/deals">Deals</Link></BackLink>',
    '<Button variant="ghost" size="icon-sm" aria-label="Back"><ArrowLeft /></Button>',
    '<Button variant="link"><ArrowRight /> Open deal</Button>',
    // A mobile sidebar toggle shows the arrow only while the sidebar is open.
    '<Button variant="ghost" size="sm" onClick={toggle}>{open ? <ArrowLeft /> : <PanelLeft />}{open ? "Back to messages" : "Show conversations"}</Button>',
  ],
  invalid: [
    {
      code: '<Button variant="ghost" size="sm" asChild><Link to="/deals"><ArrowLeft /> Deals</Link></Button>',
      errors: [{ messageId: "backLink" }],
    },
    {
      code: '<Button variant="link" onClick={back}><ArrowLeft aria-hidden="true" />Back</Button>',
      errors: [{ messageId: "backLink" }],
    },
  ],
});
