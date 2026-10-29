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
          Object target = current;
          if (current instanceof Form) {
            java.lang.reflect.Field focused = Form.class.getDeclaredField("focusedItem");
            focused.setAccessible(true);
            int index = focused.getInt(current);
            Form form = (Form)current;
            target = index >= 0 && index < form.size() ? form.get(index) : null;
          }
          if (target instanceof TextBox || target instanceof TextField) {
            TextBox box = target instanceof TextBox ? (TextBox)target : null;
            TextField field = target instanceof TextField ? (TextField)target : null;
            int constraints = box != null ? box.getConstraints() : field.getConstraints();
            String identity = Integer.toHexString(System.identityHashCode(target));
            if (token != null) {
              if (!identity.equals(token) || (constraints & TextField.UNEDITABLE) != 0) throw new IllegalArgumentException();
              String value = new String(Base64.getDecoder().decode(encoded), "UTF-8");
              if (value.length() > 256) throw new IllegalArgumentException();
              if (box != null) box.setString(value);
              else { String old = field.getString(); field.setString(value); if (!old.equals(value)) field.notifyStateChanged(); }
              current._invalidate();
              result = "OK";
            } else {
              String title = box != null ? box.getTitle() : field.getLabel();
              int max = box != null ? box.getMaxSize() : field.getMaxSize();
              String text = box != null ? box.getString() : field.getString();
              result = identity + " " + constraints + " " + max + " " + encode(title == null ? "Text" : title) + " " + encode(text);
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
