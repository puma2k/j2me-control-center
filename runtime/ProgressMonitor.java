// SPDX-License-Identifier: GPL-3.0-or-later
import java.io.*;
import java.nio.file.*;
import java.lang.reflect.*;
import java.util.*;
/** Local, read-only counters for one fingerprinted NRMod build. Never reads credentials. */
public final class ProgressMonitor implements Runnable {
  private final ClassLoader loader;
  private final Method findLoaded;
  private final Object unsafe;
  private final Method uninitialized;
  private final Map<String, Base> bases = new HashMap<String, Base>();
  private static final class Base { String player, pet; long gold, since, petPower, petSince; }
  ProgressMonitor(ClassLoader loader) throws Exception {
    this.loader=loader;
    findLoaded=ClassLoader.class.getDeclaredMethod("findLoadedClass",String.class);
    findLoaded.setAccessible(true);
    Class<?> unsafeClass=Class.forName("sun.misc.Unsafe");
    Field singleton=unsafeClass.getDeclaredField("theUnsafe"); singleton.setAccessible(true);
    unsafe=singleton.get(null);uninitialized=unsafeClass.getMethod("shouldBeInitialized",Class.class);
  }
  private static Field field(Class<?> type,String name,Class<?> valueType,boolean isStatic) throws Exception {
    for(Field f:type.getDeclaredFields()) if(f.getName().equals(name)&&f.getType()==valueType&&Modifier.isStatic(f.getModifiers())==isStatic){f.setAccessible(true);return f;}
    throw new NoSuchFieldException(name);
  }
  private static long number(Object object,String name,Class<?> type) throws Exception {
    return ((Number)field(object.getClass(),name,type,false).get(object)).longValue();
  }
  private static Object existing(Class<?> type,String name) throws Exception {return field(type,name,type,true).get(null);}
  private static String identity(Object object) throws Exception {return number(object,"U",Integer.TYPE)+":"+System.identityHashCode(object);}
  private static String value(long n){return "\""+n+"\"";}
  public synchronized void reset() { bases.clear(); sample(); }
  public synchronized void sample() {
    long now=System.currentTimeMillis(); StringBuilder rows=new StringBuilder();
    String[] names={"a.av","b.a.av","c.a.av"};
    for(int slot=0;slot<names.length;slot++) {
      if(slot>0)rows.append(',');
      rows.append("{\"slot\":").append(slot+1);
      try {
        Class<?> type=(Class<?>)findLoaded.invoke(loader,names[slot]);
        if(type==null || Boolean.TRUE.equals(uninitialized.invoke(unsafe,type)))throw new IllegalStateException();
        Object player=existing(type,"b");
        if(player==null||number(player,"e",Long.TYPE)<=0||number(player,"U",Integer.TYPE)==0)throw new IllegalStateException();
        long gold=number(player,"i",Long.TYPE); if(gold<0)throw new IllegalStateException();
        String id=identity(player);Base base=bases.get(names[slot]);
        if(base==null||!id.equals(base.player)){base=new Base();base.player=id;base.gold=gold;base.since=now;bases.put(names[slot],base);}
        rows.append(",\"status\":\"ready\",\"since\":").append(base.since).append(",\"goldStart\":").append(value(base.gold)).append(",\"gold\":").append(value(gold));
        Object pet=existing(type,"c");long power=pet==null?0:number(pet,"e",Long.TYPE);
        if(pet!=null&&power>0){
          String petId=identity(pet);
          if(!petId.equals(base.pet)||power<base.petPower){base.pet=petId;base.petPower=power;base.petSince=now;}
          rows.append(",\"petSince\":").append(base.petSince).append(",\"petStart\":").append(value(base.petPower)).append(",\"petPower\":").append(value(power));
        } else {base.pet=null;rows.append(",\"petPower\":null");}
      } catch(Exception ignored){bases.remove(names[slot]);rows.append(",\"status\":\"waiting\"");}
      rows.append('}');
    }
    String json="{\"at\":"+now+",\"slots\":["+rows+"]}";
    try {Files.write(Paths.get("progress.tmp.json"),json.getBytes("UTF-8"));Files.move(Paths.get("progress.tmp.json"),Paths.get("progress.json"),StandardCopyOption.REPLACE_EXISTING,StandardCopyOption.ATOMIC_MOVE);}catch(IOException ignored){}
  }
  public void run(){while(true){sample();try{Thread.sleep(5000);}catch(InterruptedException stop){return;}}}
}
