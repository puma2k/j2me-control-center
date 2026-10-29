// SPDX-License-Identifier: MIT
import javax.microedition.midlet.MIDlet;
import javax.microedition.lcdui.*;
import javax.microedition.rms.RecordStore;
public class ControlTest extends MIDlet {
  public void startApp() { System.out.println("TEST_JAD_PROPERTY " + getAppProperty("Control-Test-Property")); Display.getDisplay(this).setCurrent(new Screen(this)); }
  public void pauseApp() {}
  public void destroyApp(boolean unconditional) {}
  static class Screen extends Canvas {
    int count = 0, last = 0, boots = 1;
    MIDlet app;
    Screen(MIDlet app) {
      this.app = app;
      setFullScreenMode(true);
      try {
        RecordStore r = RecordStore.openRecordStore("boots", true);
        if(r.getNumRecords()>0) { boots = r.getRecord(1)[0] + 1; r.setRecord(1,new byte[]{(byte)boots},0,1); }
        else r.addRecord(new byte[]{1},0,1);
        r.closeRecordStore();
      } catch(Exception e) { boots = -1; }
    }
    protected void paint(Graphics g) {
      g.setColor(count % 2 == 0 ? 0x10233c : 0x164e40); g.fillRect(0,0,getWidth(),getHeight());
      g.setColor(0x5eead4); g.drawString("CONTROL TEST",20,30,Graphics.TOP|Graphics.LEFT);
      g.setColor(0xffffff); g.drawString("Keys: "+count,20,80,Graphics.TOP|Graphics.LEFT);
      g.drawString("Last: "+last,20,110,Graphics.TOP|Graphics.LEFT);
      g.drawString("RMS boots: "+boots,20,140,Graphics.TOP|Graphics.LEFT);
      g.drawString("Press any key",20,200,Graphics.TOP|Graphics.LEFT);
    }
    public void pointerPressed(int x,int y) { count++;last=x;System.out.println("TEST_POINTER_DOWN "+x+" "+y);repaint(); }
    public void pointerReleased(int x,int y) { System.out.println("TEST_POINTER_UP "+x+" "+y); }
    private void nativeInput(boolean formMode) {
      final Screen screen = this;
      final TextBox box = new TextBox("Native text", "", 256, TextField.ANY);
      final TextField field = new TextField("Native field", "", 256, TextField.ANY);
      final Form form = new Form("Native form"); form.append(field);
      form.setItemStateListener(new ItemStateListener() {
        public void itemStateChanged(Item item) { System.out.println("TEST_NATIVE_EDIT " + field.size()); }
      });
      final Displayable target = formMode ? form : box;
      target.addCommand(new Command("Cancel", Command.CANCEL, 0));
      target.addCommand(new Command("Help", Command.HELP, 0));
      target.addCommand(new Command("Done", Command.OK, 1));
      target.setCommandListener(new CommandListener() {
        public void commandAction(Command c, Displayable d) {
          if(c.getCommandType()!=Command.OK) { System.out.println("TEST_WRONG_COMMAND");return; }
          String value = target == box ? box.getString() : field.getString();
          try { System.out.println("TEST_NATIVE_TEXT " + java.util.Base64.getEncoder().encodeToString(value.getBytes("UTF-8"))); } catch(Exception e) {}
          Display.getDisplay(app).setCurrent(screen);
        }
      });
      Display.getDisplay(app).setCurrent(target);
    }
    private void nativeList() {
      final Screen screen = this;
      final List list = new List("Touch menu", Choice.IMPLICIT);
      list.append("First", null); list.append("Second", null);
      list.setCommandListener(new CommandListener() {
        public void commandAction(Command c, Displayable d) {
          System.out.println("TEST_LIST_SELECTED " + list.getSelectedIndex());
          Display.getDisplay(app).setCurrent(screen);
        }
      });
      Display.getDisplay(app).setCurrent(list);
    }
    public void keyPressed(int key) { if(key==57) { nativeList();return; } if(key==48) { nativeInput(false);return; } if(key==35) { nativeInput(true);return; } count++; last=key; System.out.println("TEST_KEY "+key+" COUNT "+count); repaint(); }
    public void keyReleased(int key) { System.out.println("TEST_RELEASE "+key); }
  }
}
