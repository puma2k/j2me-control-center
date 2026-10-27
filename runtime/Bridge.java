// SPDX-License-Identifier: GPL-3.0-or-later
import org.recompile.mobile.Mobile;
import org.recompile.mobile.MobilePlatform;
import java.io.*;
import java.nio.file.*;
import javax.imageio.ImageIO;
import javax.microedition.lcdui.*;
import java.util.Base64;
import java.lang.reflect.Field;

/** Private stdin protocol: FRAME, DOWN <MIDP code>, UP <MIDP code>, STOP. */
public class Bridge {
  private static int mapped(int key) {
    switch(key) {
      case -1: return Mobile.getMobileKey(0); case -2: return Mobile.getMobileKey(1);
      case -3: return Mobile.getMobileKey(2); case -4: return Mobile.getMobileKey(3);
      case -5: return Mobile.getMobileKey(7); case -6: return Mobile.getMobileKey(9);
      case -7: return Mobile.getMobileKey(8); case -8: return Mobile.getMobileKey(19);
      default: return key;
    }
  }
  // Run on the LCDUI event queue, just like pointer and key delivery. Never log text.
  private static void inputText(final String value, final int backspace) {
    if (Mobile.getDisplay() == null) return;
    Mobile.getDisplay().postInputEvent(new Runnable() {
      public void run() {
        Displayable current = Mobile.getDisplay().getCurrent();
        if (current == null) return;
        try {
          Object target = current;
          if (current instanceof Form) {
            Field focused = Form.class.getDeclaredField("focusedItem"); focused.setAccessible(true);
            int index = focused.getInt(current);
            Form form = (Form) current;
            if (index < 0 || index >= form.size()) return;
            target = form.get(index);
          }
          if (target instanceof TextBox || target instanceof TextField) {
            TextBox box = target instanceof TextBox ? (TextBox) target : null;
            TextField field = target instanceof TextField ? (TextField) target : null;
            int constraints = box != null ? box.getConstraints() : field.getConstraints();
            if ((constraints & TextField.UNEDITABLE) != 0) return;
            String old = box != null ? box.getString() : field.getString();
            int caret = box != null ? box.getCaretPosition() : field.getCaretPosition();
            int start = Math.max(0, caret - backspace);
            String next = old.substring(0, start) + value + old.substring(caret);
            if (box != null) box.setString(next); else {
              field.setString(next);
              if (!old.equals(next)) field.notifyStateChanged();
            }
            current._invalidate();
          } else if (current instanceof Canvas) {
            Canvas canvas = (Canvas) current;
            if (canvas.areKeysSuppressed()) return;
            for (int n = 0; n < backspace; n++) { canvas.keyPressed(8); canvas.keyReleased(8); }
            for (int n = 0; n < value.length(); n++) {
              int code = value.charAt(n); canvas.keyPressed(code); canvas.keyReleased(code);
            }
          }
        } catch (Exception ignored) {
          System.out.println("CONTROL_TEXT_REJECTED"); System.out.flush();
        }
      }
    });
  }
  private static void pressControl(final int key) {
    if (key == -5 && Mobile.getDisplay() != null) {
      final Displayable target = Mobile.getDisplay().getCurrent();
      if (target instanceof TextBox || target instanceof Form) {
        Mobile.getDisplay().postInputEvent(new Runnable() {
          public void run() {
            if (Mobile.getDisplay().getCurrent() != target) return;
            int best = -1;
            for (int n = 0; n < target.getCommands().size(); n++) {
              Command command = target.getCommands().get(n);
              if (command.getCommandType() == Command.OK &&
                  (best < 0 || command.getPriority() < target.getCommands().get(best).getPriority())) best = n;
            }
            if (best >= 0) {
              try {
                java.lang.reflect.Method method = Displayable.class.getDeclaredMethod("doCommand", int.class);
                method.setAccessible(true); method.invoke(target, best);
              } catch (Exception error) { System.out.println("CONTROL_CONFIRM_REJECTED"); }
            } else target.doLeftCommand();
          }
        });
        return;
      }
    }
    MobilePlatform.keyPressed(mapped(key));
  }
  public static void main(String[] args) throws Exception {
    final int width = Integer.parseInt(args[1]), height = Integer.parseInt(args[2]);
    Mobile.lcdWidth = width; Mobile.lcdHeight = height;
    Mobile.setPlatform(new MobilePlatform(width, height), new Runnable() {
      public void run() { Mobile.updateSettings(); }
    });
    MobilePlatform platform = Mobile.getPlatform();
    platform.dataPath = new File(".").getCanonicalPath() + "/";
    if (!platform.load(new File(args[0]).toURI().toString())) throw new IOException("MIDlet load failed");
    Mobile.config.settings.put("scrwidth", "" + width);
    Mobile.config.settings.put("scrheight", "" + height);
    Mobile.config.settings.put("fps", args[3]);
    Mobile.config.settings.put("phone", args[4]);
    Mobile.config.sysSettings.put("sound", "off");
    Mobile.updateSettings();
    platform.runJar();
    ProgressMonitor progress = null;
    if (args.length > 6 && args[6].equals("2618def297f0c3976d468100ce9bf59b1ef0cfd5165f2f74476b7321b792c664")) {
      try {
        progress = new ProgressMonitor(platform.loader);
        Thread monitor = new Thread(progress, "local-progress"); monitor.setDaemon(true); monitor.start();
      } catch (Exception unavailable) { System.out.println("CONTROL_PROGRESS_UNAVAILABLE"); }
    }
    System.out.println("CONTROL_READY"); System.out.flush();
    BufferedReader in = new BufferedReader(new InputStreamReader(System.in, "UTF-8"));
    String rawPath = args.length > 5 ? args[5] : "frame.rgb";
    int[] pixels = new int[width * height];
    byte[] rgb = new byte[width * height * 3];
    String line;
    while ((line = in.readLine()) != null) {
      if (line.equals("STOP")) break;
      if (line.startsWith("EDITOR_GET ")) { NativeEditor.request(line.substring(11), null, null); continue; }
      if (line.startsWith("EDITOR_SET ")) { String[] parts = line.split(" ", 4); if(parts.length == 4) NativeEditor.request(parts[1], parts[2], parts[3]); continue; }
      if (line.equals("PROGRESS_RESET")) { if (progress != null) progress.reset(); continue; }
      if (line.equals("FRAME_RAW")) {
        platform.getLcdFrontbuffer().getCanvas().getRGB(0,0,width,height,pixels,0,width);
        for(int n=0,j=0;n<pixels.length;n++){int pixel=pixels[n];rgb[j++]=(byte)(pixel>>16);rgb[j++]=(byte)(pixel>>8);rgb[j++]=(byte)pixel;}
        try(FileOutputStream out=new FileOutputStream(rawPath)){out.write(rgb);}
        System.out.println("CONTROL_FRAME");System.out.flush();
      } else if (line.equals("FRAME")) {
        ImageIO.write(platform.getLcdFrontbuffer().getCanvas(), "png", new File("frame.tmp.png"));
        Files.move(Paths.get("frame.tmp.png"), Paths.get("frame.png"), StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
        System.out.println("CONTROL_FRAME"); System.out.flush();
      } else if(line.startsWith("TEXT ")) {
        String[] parts = line.split(" ", 3);
        int backspace = Integer.parseInt(parts[1]);
        String value = parts.length > 2 ? new String(Base64.getDecoder().decode(parts[2]), "UTF-8") : "";
        if (backspace >= 0 && backspace <= 256 && value.length() <= 256) inputText(value, backspace);
      } else if(line.startsWith("POINTER ")) {
        String[] parts=line.split(" "); int x=Integer.parseInt(parts[2]), y=Integer.parseInt(parts[3]);
        if(x<0||y<0||x>=width||y>=height)continue;
        if(parts[1].equals("down"))MobilePlatform.pointerPressed(x,y);
        else if(parts[1].equals("move"))MobilePlatform.pointerDragged(x,y);
        else if(parts[1].equals("up"))MobilePlatform.pointerReleased(x,y);
      } else if (line.startsWith("DOWN ")) pressControl(Integer.parseInt(line.substring(5)));
      else if (line.startsWith("UP ")) MobilePlatform.keyReleased(mapped(Integer.parseInt(line.substring(3))));
    }
    System.exit(0);
  }
}
