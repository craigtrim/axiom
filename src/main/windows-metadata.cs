using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
using Microsoft.Win32.SafeHandles;
public static class AxiomFileMetadata {
 [StructLayout(LayoutKind.Sequential)] public struct Key { public Guid format; public uint id; }
 [StructLayout(LayoutKind.Sequential)] struct IoStatus { public IntPtr status; public UIntPtr information; }
 [ComImport,Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
 interface IPropertyStore { [PreserveSig]int GetCount(out uint count); [PreserveSig]int GetAt(uint index,out Key key); [PreserveSig]int GetValue(ref Key key,IntPtr variant); [PreserveSig]int SetValue(ref Key key,IntPtr variant); [PreserveSig]int Commit(); }
 [DllImport("shell32.dll",CharSet=CharSet.Unicode,PreserveSig=true)] static extern int SHGetPropertyStoreFromParsingName(string path,IntPtr bind,uint flags,ref Guid iid,out IPropertyStore store);
 [DllImport("propsys.dll",PreserveSig=true)] static extern int PSGetNameFromPropertyKey(ref Key key,out IntPtr name);
 [DllImport("propsys.dll",PreserveSig=true)] static extern int PropVariantToStringAlloc(IntPtr variant,out IntPtr text);
 [DllImport("ole32.dll",PreserveSig=true)] static extern int PropVariantClear(IntPtr variant);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern SafeFileHandle CreateFile(string path,uint access,uint share,IntPtr security,uint creation,uint flags,IntPtr template);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool GetFileInformationByHandleEx(SafeFileHandle handle,int kind,IntPtr data,uint size);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool DeviceIoControl(SafeFileHandle handle,uint code,byte[] input,uint inputSize,byte[] output,uint size,out uint returned,IntPtr overlapped);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern uint GetFinalPathNameByHandle(SafeFileHandle handle,StringBuilder output,uint length,uint flags);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool GetVolumePathName(string file,StringBuilder volume,uint size);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool GetVolumeInformation(string root,StringBuilder label,uint labelSize,out uint serial,out uint maxName,out uint flags,StringBuilder system,uint systemSize);
 [DllImport("ntdll.dll")] static extern int NtQueryEaFile(SafeFileHandle file,out IoStatus status,byte[] buffer,uint length,bool single,IntPtr list,uint listLength,IntPtr index,bool restart);
 static Dictionary<string,object> Error(int code){return new Dictionary<string,object>{{"status","unavailable"},{"code",code},{"message",new System.ComponentModel.Win32Exception(code).Message}};}
 static Dictionary<string,object> Result(object value){return new Dictionary<string,object>{{"status","collected"},{"value",value}};}
 static string Time(long ticks){try{return DateTime.FromFileTimeUtc(ticks).ToString("o");}catch{return ticks.ToString();}}
 static byte[] Bytes(IntPtr p,int count){var result=new byte[count];Marshal.Copy(p,result,0,count);return result;}
 public static object Properties(string file){
  IPropertyStore store=null;var iid=new Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99");
  int hr=SHGetPropertyStoreFromParsingName(file,IntPtr.Zero,0x10,ref iid,out store);if(hr<0)return Error(hr);
  var output=new List<object>();
  try{
   uint count;Marshal.ThrowExceptionForHR(store.GetCount(out count));
   for(uint i=0;i<count;i++){
    Key key;hr=store.GetAt(i,out key);if(hr<0){output.Add(Error(hr));continue;}
    string name=key.format.ToString("D")+":"+key.id;IntPtr canonical;
    if(PSGetNameFromPropertyKey(ref key,out canonical)>=0&&canonical!=IntPtr.Zero){name=Marshal.PtrToStringUni(canonical);Marshal.FreeCoTaskMem(canonical);}
    IntPtr pv=Marshal.AllocCoTaskMem(32);for(int n=0;n<32;n++)Marshal.WriteByte(pv,n,0);
    var item=new Dictionary<string,object>{{"key",name},{"formatId",key.format.ToString("D")},{"propertyId",key.id}};
    try{
     hr=store.GetValue(ref key,pv);item["hresult"]=hr;if(hr<0)item["status"]="unavailable";
     if(hr>=0){
      ushort type=(ushort)Marshal.ReadInt16(pv);item["variantType"]=type;if(type==64){long raw=Marshal.ReadInt64(pv,8);item["rawFileTime"]=raw.ToString();item["utc"]=Time(raw);}
      if(type==0||type==1)item["value"]=null;
      else if((type&0x1000)!=0){
       uint length=(uint)Marshal.ReadInt32(pv,8);IntPtr data=Marshal.ReadIntPtr(pv,16);ushort element=(ushort)(type&0x0fff);
       var values=new List<object>();if(length>1000000)throw new InvalidOperationException("Property vector exceeds one million values.");
       if(element==17){item["valueBase64"]=Convert.ToBase64String(Bytes(data,(int)length));}
       else if(element==31||element==30||element==8){for(int n=0;n<length;n++){IntPtr value=Marshal.ReadIntPtr(data,n*IntPtr.Size);values.Add(element==30?Marshal.PtrToStringAnsi(value):element==8?Marshal.PtrToStringBSTR(value):Marshal.PtrToStringUni(value));}item["value"]=values;}
       else {int size=element==21||element==20||element==5||element==64?8:element==18||element==2||element==11?2:element==16?1:element==72?16:element==12?24:4;item["valueBase64"]=Convert.ToBase64String(Bytes(data,checked((int)length*size)));item["elementType"]=element;item["elementCount"]=length;}
      }else if(type==65){int length=Marshal.ReadInt32(pv,8);if(length<0||length>16777216)throw new InvalidOperationException("Property blob exceeds 16 MB.");item["valueBase64"]=Convert.ToBase64String(Bytes(Marshal.ReadIntPtr(pv,16),length));}
      else{IntPtr text;int converted=PropVariantToStringAlloc(pv,out text);if(converted>=0){item["value"]=Marshal.PtrToStringUni(text);Marshal.FreeCoTaskMem(text);}else{item["conversionStatus"]=converted;item["status"]="value-type-not-convertible";}}
     }
    }catch(Exception e){item["status"]="error";item["error"]=e.Message;}
    finally{PropVariantClear(pv);Marshal.FreeCoTaskMem(pv);}
    output.Add(item);
   }
   return new Dictionary<string,object>{{"status","collected"},{"count",count},{"properties",output}};
  }finally{if(store!=null)Marshal.ReleaseComObject(store);}
 }
 public static object Native(string file){
  var output=new Dictionary<string,object>();
  using(var handle=CreateFile(file,0x88,7,IntPtr.Zero,3,0x02200000,IntPtr.Zero)){
   if(handle.IsInvalid){output["open"]=Error(Marshal.GetLastWin32Error());return output;}
   var kinds=new Dictionary<int,string>{{0,"basic"},{1,"standard"},{2,"name"},{7,"streams"},{8,"compression"},{9,"attributeTag"},{13,"remoteProtocol"},{16,"storage"},{17,"alignment"},{18,"fileId"},{23,"caseSensitive"},{24,"normalizedName"}};
   foreach(var entry in kinds){
    IntPtr data=Marshal.AllocHGlobal(65536);for(int i=0;i<65536;i++)Marshal.WriteByte(data,i,0);
    try{
     if(!GetFileInformationByHandleEx(handle,entry.Key,data,65536)){output[entry.Value]=Error(Marshal.GetLastWin32Error());continue;}
     var value=new Dictionary<string,object>();
     if(entry.Key==0){string[] names={"creation","lastAccess","lastWrite","change"};for(int i=0;i<4;i++){long ticks=Marshal.ReadInt64(data,i*8);value[names[i]+"FileTime"]=ticks.ToString();value[names[i]+"Utc"]=Time(ticks);}value["attributes"]=(uint)Marshal.ReadInt32(data,32);}
     else if(entry.Key==1){value["allocationSize"]=Marshal.ReadInt64(data).ToString();value["endOfFile"]=Marshal.ReadInt64(data,8).ToString();value["numberOfLinks"]=(uint)Marshal.ReadInt32(data,16);value["deletePending"]=Marshal.ReadByte(data,20)!=0;value["directory"]=Marshal.ReadByte(data,21)!=0;}
     else if(entry.Key==2||entry.Key==24){int length=Marshal.ReadInt32(data);value["name"]=Marshal.PtrToStringUni(IntPtr.Add(data,4),Math.Min(length,65532)/2);}
     else if(entry.Key==7){var streams=new List<object>();int offset=0;while(offset<65512){uint next=(uint)Marshal.ReadInt32(data,offset);int length=Marshal.ReadInt32(data,offset+4);if(length<0||offset+24+length>65536)break;streams.Add(new Dictionary<string,object>{{"name",Marshal.PtrToStringUni(IntPtr.Add(data,offset+24),length/2)},{"size",Marshal.ReadInt64(data,offset+8).ToString()},{"allocationSize",Marshal.ReadInt64(data,offset+16).ToString()}});if(next==0)break;offset+=(int)next;}value["streams"]=streams;}
     else if(entry.Key==18){value["volumeSerialNumber"]=((ulong)Marshal.ReadInt64(data)).ToString("X16");value["fileId128"]=BitConverter.ToString(Bytes(IntPtr.Add(data,8),16)).Replace("-","");}
     else if(entry.Key==9){value["attributes"]=(uint)Marshal.ReadInt32(data);value["reparseTag"]=((uint)Marshal.ReadInt32(data,4)).ToString("X8");}
     else if(entry.Key==8){value["compressedFileSize"]=Marshal.ReadInt64(data).ToString();value["format"]=(ushort)Marshal.ReadInt16(data,8);value["compressionUnitShift"]=Marshal.ReadByte(data,10);value["chunkShift"]=Marshal.ReadByte(data,11);value["clusterShift"]=Marshal.ReadByte(data,12);}
     else if(entry.Key==16){string[] names={"logicalBytesPerSector","physicalBytesPerSectorForAtomicity","physicalBytesPerSectorForPerformance","effectivePhysicalBytesPerSectorForAtomicity","flags","byteOffsetForSectorAlignment","byteOffsetForPartitionAlignment"};for(int i=0;i<names.Length;i++)value[names[i]]=(uint)Marshal.ReadInt32(data,i*4);}
     else if(entry.Key==17||entry.Key==23)value["flags"]=(uint)Marshal.ReadInt32(data);
     else if(entry.Key==13){int length=(ushort)Marshal.ReadInt16(data,2);value["rawBase64"]=Convert.ToBase64String(Bytes(data,Math.Min(65536,Math.Max(116,length))));}
     output[entry.Value]=Result(value);
    }finally{Marshal.FreeHGlobal(data);}
   }
   var finalPath=new StringBuilder(32768);if(GetFinalPathNameByHandle(handle,finalPath,32768,0)>0)output["finalPath"]=Result(finalPath.ToString());else output["finalPath"]=Error(Marshal.GetLastWin32Error());
   var codes=new Dictionary<uint,string>{{0x900a8,"reparseData"},{0x9009c,"objectId"},{0x900eb,"usnRecord"},{0x9003c,"compressionState"},{0x9027c,"integrity"}};
   foreach(var entry in codes){byte[] data=new byte[65536];uint length;if(DeviceIoControl(handle,entry.Key,null,0,data,(uint)data.Length,out length,IntPtr.Zero))output[entry.Value]=Result(new Dictionary<string,object>{{"controlCode",entry.Key.ToString("X")},{"byteLength",length},{"rawBase64",Convert.ToBase64String(data,0,(int)length)}});else output[entry.Value]=Error(Marshal.GetLastWin32Error());}
   byte[] ea=new byte[1048576];IoStatus status;int nt=NtQueryEaFile(handle,out status,ea,(uint)ea.Length,false,IntPtr.Zero,0,IntPtr.Zero,true);
   if(nt>=0){var values=new List<object>();int offset=0,total=(int)status.information.ToUInt64();while(offset+8<=total){int next=BitConverter.ToInt32(ea,offset),nameLength=ea[offset+5],valueLength=BitConverter.ToUInt16(ea,offset+6);if(offset+9+nameLength+valueLength>total)break;values.Add(new Dictionary<string,object>{{"name",Encoding.ASCII.GetString(ea,offset+8,nameLength)},{"flags",ea[offset+4]},{"valueBase64",Convert.ToBase64String(ea,offset+9+nameLength,valueLength)}});if(next==0)break;offset+=next;}output["extendedAttributes"]=Result(values);}
   else output["extendedAttributes"]=new Dictionary<string,object>{{"status",nt==unchecked((int)0xC0000052)?"empty":"unavailable"},{"ntstatus",nt.ToString("X8")}};
  }
  var root=new StringBuilder(32768);if(GetVolumePathName(file,root,32768)){var label=new StringBuilder(1024);var system=new StringBuilder(1024);uint serial,maxName,flags;if(GetVolumeInformation(root.ToString(),label,1024,out serial,out maxName,out flags,system,1024))output["volume"]=Result(new Dictionary<string,object>{{"root",root.ToString()},{"label",label.ToString()},{"fileSystem",system.ToString()},{"serial",serial.ToString("X8")},{"maximumComponentLength",maxName},{"flags",flags}});else output["volume"]=Error(Marshal.GetLastWin32Error());}
  return output;
 }

 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)]static extern IntPtr FindFirstFileNameW(string file,uint flags,ref uint length,StringBuilder name);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)]static extern bool FindNextFileNameW(IntPtr handle,ref uint length,StringBuilder name);
 [DllImport("kernel32.dll",SetLastError=true)]static extern bool FindClose(IntPtr handle);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)]static extern uint GetShortPathName(string file,StringBuilder output,uint length);
 [DllImport("advapi32.dll",CharSet=CharSet.Unicode,SetLastError=true)]static extern bool FileEncryptionStatus(string file,out uint status);
 public static object Additional(string file,bool readContent){
  var output=new Dictionary<string,object>();uint length=32768;var name=new StringBuilder(32768);IntPtr links=FindFirstFileNameW(file,0,ref length,name);
  if(links==new IntPtr(-1))output["hardLinkNames"]=Error(Marshal.GetLastWin32Error());else{var names=new List<string>();try{names.Add(name.ToString());for(;;){length=32768;name.Clear();if(!FindNextFileNameW(links,ref length,name)){int error=Marshal.GetLastWin32Error();if(error!=38)output["hardLinkEnumerationError"]=Error(error);break;}names.Add(name.ToString());}}finally{FindClose(links);}output["hardLinkNames"]=Result(names);}
  name.Clear();uint n=GetShortPathName(file,name,32768);output["shortPath"]=n>0&&n<32768?Result(name.ToString()):Error(Marshal.GetLastWin32Error());
  uint encryption;output["encryptionStatus"]=FileEncryptionStatus(file,out encryption)?Result(encryption):Error(Marshal.GetLastWin32Error());
  if(!readContent){output["allocationQueries"]=new Dictionary<string,object>{{"status","not-read"},{"reason","Directory, reparse or offline content"}};return output;}
  using(var handle=CreateFile(file,0x80000000,7,IntPtr.Zero,3,0x02200000,IntPtr.Zero)){
   if(handle.IsInvalid){output["allocationQueries"]=Error(Marshal.GetLastWin32Error());return output;}
   foreach(var code in new uint[]{0x940cf,0x90073}){var buffer=new byte[1048576];byte[] input=code==0x940cf?new byte[16]:new byte[8];if(code==0x940cf)Array.Copy(BitConverter.GetBytes(new System.IO.FileInfo(file).Length),0,input,8,8);uint returned;bool ok=DeviceIoControl(handle,code,input,(uint)input.Length,buffer,(uint)buffer.Length,out returned,IntPtr.Zero);int error=ok?0:Marshal.GetLastWin32Error();var result=new Dictionary<string,object>{{"status",ok?"collected":error==234?"partial":"unavailable"},{"code",error},{"rawBase64",Convert.ToBase64String(buffer,0,(int)returned)},{"byteLength",returned},{"bufferLimit",buffer.Length}};output[code==0x940cf?"allocatedRanges":"retrievalPointers"]=result;}
  }return output;
 }
 public static object Journal(string root,string[] fileIds,int timeoutSeconds){
  string volume=System.IO.Path.GetPathRoot(root);if(volume.Length!=3||volume[1]!=':')return new Dictionary<string,object>{{"status","unavailable"},{"reason","USN journals require a local volume handle."}};
  using(var handle=CreateFile(@"\\.\"+volume.Substring(0,2),0x80000000,7,IntPtr.Zero,3,0,IntPtr.Zero)){
   if(handle.IsInvalid)return Error(Marshal.GetLastWin32Error());
   var buffer=new byte[1048576];uint returned;if(!DeviceIoControl(handle,0x900f4,null,0,buffer,(uint)buffer.Length,out returned,IntPtr.Zero))return Error(Marshal.GetLastWin32Error());
   var output=new Dictionary<string,object>{{"status","collected"},{"journalInformationBase64",Convert.ToBase64String(buffer,0,(int)returned)},{"volume",volume}};
   if(returned<56){output["status"]="unavailable";output["message"]="Unrecognized journal information structure.";return output;}
   ulong journalId=BitConverter.ToUInt64(buffer,0);long start=BitConverter.ToInt64(buffer,8),end=BitConverter.ToInt64(buffer,16);output["firstUsn"]=start.ToString();var ids=new HashSet<string>(fileIds,StringComparer.OrdinalIgnoreCase);var records=new List<object>();var clock=System.Diagnostics.Stopwatch.StartNew();long bytes=0;
   while(start<end){
    if(clock.Elapsed.TotalSeconds>timeoutSeconds||bytes>536870912){output["status"]="partial";output["message"]="Journal collection reached its time or 512 MB read limit.";break;}
    var input=new byte[40];Array.Copy(BitConverter.GetBytes(start),input,8);Array.Copy(BitConverter.GetBytes(uint.MaxValue),0,input,8,4);Array.Copy(BitConverter.GetBytes(journalId),0,input,32,8);
    if(!DeviceIoControl(handle,0x900bb,input,40,buffer,(uint)buffer.Length,out returned,IntPtr.Zero)){output["status"]="partial";output["readError"]=Error(Marshal.GetLastWin32Error());break;}bytes+=returned;if(returned<8)break;long next=BitConverter.ToInt64(buffer,0);
    for(int offset=8;offset+8<=returned;){int size=BitConverter.ToInt32(buffer,offset);ushort version=BitConverter.ToUInt16(buffer,offset+4);if(size<8||offset+size>returned){output["status"]="partial";output["message"]="Unexpected journal record boundary.";break;}
     int idSize=version==2?8:version==3?16:0;
     if(idSize>0&&size>=(version==2?60:76)){string id=BitConverter.ToString(buffer,offset+8,idSize).Replace("-","");if(ids.Contains(id)||ids.Contains(id.PadRight(32,'0'))){int usnOffset=version==2?24:40,nameLengthOffset=version==2?56:72;long usn=BitConverter.ToInt64(buffer,offset+usnOffset);if(usn<end){ushort nameLength=BitConverter.ToUInt16(buffer,offset+nameLengthOffset),nameOffset=BitConverter.ToUInt16(buffer,offset+nameLengthOffset+2);records.Add(new Dictionary<string,object>{{"fileId",id},{"majorVersion",version},{"usn",usn.ToString()},{"timestampUtc",Time(BitConverter.ToInt64(buffer,offset+usnOffset+8))},{"reasonFlags",BitConverter.ToUInt32(buffer,offset+usnOffset+16)},{"fileName",nameOffset+nameLength<=size?Encoding.Unicode.GetString(buffer,offset+nameOffset,nameLength):""},{"rawBase64",Convert.ToBase64String(buffer,offset,size)}});}}}
     else{output["unparsedRecordVersion"]=version;output["status"]="partial";}
     offset+=size;
    }if(next<=start)break;start=next;
   }output["records"]=records;output["bytesRead"]=bytes;output["journalId"]=journalId.ToString();output["nextUsnAfterRead"]=start.ToString();output["endUsnAtStart"]=end.ToString();return output;
  }
 }

}