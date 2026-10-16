// SPDX-License-Identifier: GPL-3.0-or-later
package javax.microedition.io;

import java.io.*;
import java.net.*;

/** Real JSR-118 TCP connection. Stream failures propagate instead of returning null. */
final class SocketConnectionImpl implements SocketConnection {
  private final Socket socket;
  private final InputStream input;
  private final OutputStream output;
  private final int mode;
  SocketConnectionImpl(String address, int mode) throws IOException {
    if (mode < Connector.READ || mode > Connector.READ_WRITE) throw new IllegalArgumentException("Invalid connection mode");
    this.mode = mode;
    URI uri;
    try { uri = new URI(address); } catch (URISyntaxException e) { throw new ConnectionNotFoundException("Invalid socket URL"); }
    if (uri.getHost() == null || uri.getPort() < 1 || uri.getPort() > 65535 || uri.getRawQuery() != null || uri.getRawUserInfo() != null || uri.getRawFragment() != null || (uri.getPath()!=null && !uri.getPath().isEmpty())) throw new ConnectionNotFoundException("Expected socket://host:port");
    socket = new Socket();
    try {
      socket.connect(new InetSocketAddress(uri.getHost(), uri.getPort()), 10000);
      input = socket.getInputStream(); output = socket.getOutputStream();
    } catch (IOException e) { try { socket.close(); } catch (IOException ignored) {} throw e; }
  }
  public InputStream openInputStream() { if (mode == Connector.WRITE) throw new IllegalStateException("Write-only connection"); return input; }
  public DataInputStream openDataInputStream() { return new DataInputStream(openInputStream()); }
  public OutputStream openOutputStream() { if (mode == Connector.READ) throw new IllegalStateException("Read-only connection"); return output; }
  public DataOutputStream openDataOutputStream() { return new DataOutputStream(openOutputStream()); }
  public void close() { try { socket.close(); } catch (IOException ignored) {} }
  public String getAddress() { return socket.getInetAddress().getHostAddress(); }
  public String getLocalAddress() { return socket.getLocalAddress().getHostAddress(); }
  public int getLocalPort() { return socket.getLocalPort(); }
  public int getPort() { return socket.getPort(); }
  public int getSocketOption(byte option) {
    try { switch(option) {
      case DELAY:return socket.getTcpNoDelay()?0:1;
      case KEEPALIVE:return socket.getKeepAlive()?1:0;
      case LINGER:return Math.max(0,socket.getSoLinger());
      case RCVBUF:return socket.getReceiveBufferSize();
      case SNDBUF:return socket.getSendBufferSize();
      default:throw new IllegalArgumentException("Invalid socket option");
    }} catch(SocketException e) { throw new IllegalStateException(e); }
  }
  public void setSocketOption(byte option,int value) {
    if(value<0)throw new IllegalArgumentException("Negative socket option");
    try { switch(option) {
      case DELAY:socket.setTcpNoDelay(value==0);break;
      case KEEPALIVE:socket.setKeepAlive(value!=0);break;
      case LINGER:socket.setSoLinger(value!=0,value);break;
      case RCVBUF:socket.setReceiveBufferSize(value);break;
      case SNDBUF:socket.setSendBufferSize(value);break;
      default:throw new IllegalArgumentException("Invalid socket option");
    }} catch(SocketException e) { throw new IllegalStateException(e); }
  }
}
