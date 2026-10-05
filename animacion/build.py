import subprocess
FPS=30
# (duración s, zoom inicio, zoom fin, transición hacia el siguiente s)
P={1:(1.0,1.03,1.06,.15),2:(.8,1.03,1.06,.15),3:(.8,1.03,1.07,.15),4:(.8,1.03,1.07,.15),
   5:(.9,1.03,1.08,.12),6:(.7,1.03,1.07,.12),7:(.9,1.03,1.08,.12),8:(.8,1.03,1.07,.12),
   9:(.7,1.03,1.08,.10),10:(.6,1.03,1.10,.08),11:(.45,1.04,1.12,.06),12:(.4,1.04,1.14,.06),
   13:(.4,1.04,1.16,.06),14:(.5,1.04,1.25,.12),15:(.6,1.04,1.08,.25),16:(2.4,1.00,1.06,0)}
inp=[];f=[]
for n,(d,z0,z1,t) in P.items():
    fr=int(round(d*FPS))
    inp+=['-loop','1','-framerate',str(FPS),'-t',str(d),'-i',f'p/{n}.png']
    z=f"{z0}+({z1}-{z0})*on/{fr}"
    sh=""
    if n==14: sh="+30*sin(on*2.1)"
    f.append(f"[{n-1}]zoompan=z='{z}':x='iw/2-iw/zoom/2{sh}':y='ih/2-ih/zoom/2{sh.replace('2.1','2.7')}':d=1:s=1440x952:fps={FPS},setsar=1,format=yuv420p[v{n}]")
prev="v1";off=0
for n in range(1,16):
    d,_,_,t=P[n]; off+=d-t
    out=f"x{n}" if n<15 else "vout"
    tr="fade"
    f.append(f"[{prev}][v{n+1}]xfade=transition={tr}:duration={t}:offset={off:.3f}[{out}]")
    prev=out
f.append("[vout]fade=t=out:st=%.2f:d=0.4[final]"%(off+P[16][0]-0.4))
cmd=['ffmpeg','-v','error','-y',*inp,'-filter_complex',';'.join(f),'-map','[final]','-c:v','libx264','-crf','18','-preset','slow','-pix_fmt','yuv420p','-movflags','+faststart','historia_detras_del_juego.mp4']
subprocess.run(cmd,check=True)
