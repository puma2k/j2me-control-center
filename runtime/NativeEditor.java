// SPDX-License-Identifier: GPL-3.0-or-later
import javax.microedition.lcdui.*;
import org.recompile.mobile.Mobile;
import java.util.Base64;
public final class NativeEditor {
  private static String encode(String s) throws Exception {
    return Base64.getEncoder().encodeToString(s.getBytes("UTF-8"));
  }
  public static void request(final String request, final String token, final String encoded) {
    Mobile.getDisplay().postInputEvent(new Runnable() {
      public void run() {
        String result = "NONE";
        try {
          Displayable current = Mobile.getDisplay().getCurrent();
          if (current instanceof TextBox) {
            TextBox box = (TextBox)current;
            String identity = Integer.toHexString(System.identityHashCode(box));
            if (token != null) {
              if (!identity.equals(token) || (box.getConstraints() & TextField.UNEDITABLE) != 0) throw new IllegalArgumentException();
              String value = new String(Base64.getDecoder().decode(encoded), "UTF-8");
              if (value.length() > 256) throw new IllegalArgumentException();
              box.setString(value);
              box._invalidate();
              result = "OK";
            } else {
              result = identity + " " + box.getConstraints() + " " + box.getMaxSize() + " " + encode(box.getTitle() == null ? "Text" : box.getTitle()) + " " + encode(box.getString());
            }
          } else if (token != null) throw new IllegalArgumentException();
        } catch (Exception rejected) { result = "ERROR"; }
        synchronized(System.out) {
          System.out.println("CONTROL_EDITOR " + request + " " + result);
          System.out.flush();
        }
      }
    });
  }
}
