package com.mailtasks.app;

import android.content.Intent;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Receives text shared to MailTasks from other apps (e.g. Gmail) and hands it to the web layer. */
@CapacitorPlugin(name = "ShareReceiver")
public class ShareReceiverPlugin extends Plugin {
    private JSObject pending = null;

    @Override
    public void load() {
        if (getActivity() != null) {
            JSObject data = extract(getActivity().getIntent());
            if (data != null) {
                pending = data;
                getActivity().setIntent(new Intent(Intent.ACTION_MAIN));
            }
        }
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        JSObject data = extract(intent);
        if (data != null) {
            if (hasListeners("shared")) {
                notifyListeners("shared", data, true);
            } else {
                pending = data;
            }
        }
    }

    @PluginMethod
    public void getPending(PluginCall call) {
        JSObject out = pending != null ? pending : new JSObject();
        pending = null;
        call.resolve(out);
    }

    private JSObject extract(Intent intent) {
        if (intent == null || !Intent.ACTION_SEND.equals(intent.getAction())) return null;
        String type = intent.getType();
        if (type == null || !type.startsWith("text/")) return null;
        CharSequence text = intent.getCharSequenceExtra(Intent.EXTRA_TEXT);
        String subject = intent.getStringExtra(Intent.EXTRA_SUBJECT);
        if (text == null && subject == null) return null;
        JSObject o = new JSObject();
        o.put("text", text != null ? text.toString() : "");
        o.put("subject", subject != null ? subject : "");
        return o;
    }
}
