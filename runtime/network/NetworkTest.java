// SPDX-License-Identifier: MIT
import java.net.*;
import java.io.*;
import javax.microedition.io.*;
public class NetworkTest {
  public static void main(String[] args) throws Exception {
    final ServerSocket server = new ServerSocket(0,8,InetAddress.getByName("127.0.0.1"));
    Thread echo = new Thread(new Runnable(){public void run(){try {
      for(int i=0;i<2;i++){Socket s=server.accept();s.setSoTimeout(5000);int value=s.getInputStream().read();s.getOutputStream().write(value);s.close();}
    }catch(Exception e){throw new RuntimeException(e);}}});echo.start();
    String url="socket://127.0.0.1:"+server.getLocalPort();
    SocketConnection connection=(SocketConnection)Connector.open(url);
    connection.setSocketOption(SocketConnection.DELAY,0);
    if(connection.getSocketOption(SocketConnection.DELAY)!=0)throw new AssertionError("DELAY");
    connection.openDataOutputStream().writeByte(203);
    if(connection.openDataInputStream().readUnsignedByte()!=203)throw new AssertionError("Echo mismatch");
    connection.close(); connection.close();
    SocketConnection read=(SocketConnection)Connector.open(url,Connector.READ);
    boolean rejected=false;try{read.openOutputStream();}catch(IllegalStateException e){rejected=true;}
    if(!rejected)throw new AssertionError("READ mode");read.close();echo.join(5000);server.close();
    if(echo.isAlive())throw new AssertionError("Echo did not terminate");
    boolean invalid=false;try{Connector.open("socket://127.0.0.1");}catch(IOException e){invalid=true;}
    if(!invalid)throw new AssertionError("Missing port accepted");
    System.out.println("NETWORK_TEST_PASS real TCP echo, data streams, options, mode and close");
  }
}
