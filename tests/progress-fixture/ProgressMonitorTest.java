import java.net.*;import java.nio.file.*;import java.lang.reflect.*;
public class ProgressMonitorTest {
 static String snapshot()throws Exception{return new String(Files.readAllBytes(Paths.get("progress.json")),"UTF-8");}
 static void check(boolean b)throws Exception{if(!b)throw new Exception("Progress assertion failed: "+snapshot());}
 public static void main(String[] args)throws Exception{
  URLClassLoader loader=new URLClassLoader(new URL[]{Paths.get(args[0]).toUri().toURL()},null);
  ProgressMonitor monitor=new ProgressMonitor(loader);monitor.sample();check(!snapshot().contains("ready"));
  Class.forName("a.av",false,loader);monitor.sample();check(!snapshot().contains("ready"));
  Class<?> type=Class.forName("a.av",true,loader);Object player=type.getField("b").get(null);
  monitor.sample();check(snapshot().contains("\"goldStart\":\"1000\""));
  type.getField("i").setLong(player,1100);monitor.sample();check(snapshot().contains("\"gold\":\"1100\""));check(snapshot().contains("\"goldStart\":\"1000\""));
  monitor.reset();check(snapshot().contains("\"goldStart\":\"1100\""));
  type.getField("c").set(null,null);monitor.sample();check(snapshot().contains("\"petPower\":null"));
  type.getField("b").set(null,null);monitor.sample();check(!snapshot().contains("ready"));
  loader.close();System.out.println("PROGRESS_TEST_PASS");
 }
}
